import { Bee, Data, FeedReader } from '@ethersphere/bee-js';

import { retryAwaitableAsync, sleep } from '../utils/common';
import { CLUSTER_ID, CLUSTER_TIMESTAMP, FIRST_SEGMENT_INDEX, HEX_RADIX, TIMESTAMP_SCALE } from '../utils/constants';
import { EventEmitter } from '../utils/eventEmitter';
import { decrementHexString, incrementHexString } from '../utils/operations';
import { findHexInUint8Array, parseVint } from '../utils/webm';

import { AsyncQueue } from './asyncQueue';
import BeeWrapper from './bee';

interface AttachOptions {
  media: HTMLVideoElement;
  address: string;
  topic: string;
}

interface AttachOptions {
  media: HTMLVideoElement;
  address: string;
  topic: string;
}

export interface VideoDuration {
  duration: number;
  index: number;
}

export interface Controls {
  play: () => Promise<void>;
  seek: (index: number) => Promise<void>;
  restart: () => Promise<void>;
  setVolumeControl: (volumeControl: HTMLInputElement) => void;
  pause: () => void;
  continueStream: () => void;
  getDuration: () => Promise<VideoDuration>;
  on: EventEmitter['on'];
  off: EventEmitter['off'];
}

export interface PlayerOptions {
  timeslice: number;
  minLiveThreshold: number;
  initBufferTime: number;
  buffer: number;
  dynamicBufferIncrement: number;
}

interface SegmentBuffer {
  [key: string]: any;
  loading?: boolean;
  segment?: Uint8Array | null;
  error?: any;
}

export const playerBee = new BeeWrapper();
let bee: Bee;
const emitter = new EventEmitter();
const segmentBuffer: SegmentBuffer = {};

let mediaElement: HTMLVideoElement;
let mediaSource: MediaSource;
let sourceBuffer: SourceBuffer;
let streamTimer: NodeJS.Timeout | null;
let reader: FeedReader;
let processQueue: AsyncQueue;
let currIndex = '';
let seekIndex = '';

const settings: PlayerOptions = {
  timeslice: 2000,
  minLiveThreshold: 1,
  initBufferTime: 0,
  buffer: 5,
  dynamicBufferIncrement: 0,
};

const eventStates: Record<string, boolean> = {
  loadingPlaying: false,
  loadingDuration: false,
  isPlaying: false,
};

export const EVENTS = {
  LOADING_PLAYING_CHANGE: 'loadingPlaying',
  LOADING_DURATION_CHANGE: 'loadingPlaying',
  IS_PLAYING_CHANGE: 'isPlaying',
};

export function getMediaElement() {
  return mediaElement;
}

async function getApproxDuration(): Promise<VideoDuration> {
  const metaFeedUpdateRes = await reader.download();
  const decimalIndex = parseInt(metaFeedUpdateRes.feedIndex as string, HEX_RADIX);
  return { duration: decimalIndex * settings.timeslice, index: decimalIndex };
}

function setPlayerOptions(s: Partial<Record<keyof PlayerOptions, number>>) {
  Object.keys(s).map((k) => {
    const typedK = k as keyof PlayerOptions;
    if (s[typedK] !== undefined && s[typedK] !== null) {
      settings[typedK] = s[typedK]!;
    }
  });
}

function setFeedReader(rawTopic: string, owner: string) {
  const topic = bee.makeFeedTopic(rawTopic);
  reader = bee.makeFeedReader('sequence', topic, owner);
}

function setVolumeControl(volumeControl: HTMLInputElement) {
  volumeControl.addEventListener('input', () => {
    mediaElement.volume = +volumeControl.value / 100;
  });
}

async function play(settings?: { shouldCleanSourceBuffer: boolean }) {
  if (eventStates.loadingPlaying) {
    return;
  }

  emitEvent(EVENTS.LOADING_PLAYING_CHANGE, true);

  if (settings?.shouldCleanSourceBuffer) {
    await cleanSourceBuffer();
  }

  if (!sourceBuffer) {
    mediaElement.src = URL.createObjectURL(mediaSource);
  }
  while (mediaSource.readyState !== 'open') {
    await sleep(100);
  }
  startAppending();
}

function continueStream() {
  continueAppending();
}

function pause() {
  pauseAppending();
  mediaElement.pause();
  emitEvent(EVENTS.IS_PLAYING_CHANGE, false);
}

async function restart() {
  play({ shouldCleanSourceBuffer: true });
}

async function seek(index: number) {
  setSeekIndex(index);
  play({ shouldCleanSourceBuffer: true });
}

export function attach(options: AttachOptions): Controls {
  bee = playerBee.getBee();
  mediaSource = new MediaSource();
  mediaElement = options.media;
  setFeedReader(options.topic, options.address);

  // TODO handle these errors
  mediaElement.addEventListener('error', (_e) => {
    console.error('Video error:', mediaElement?.error?.code, mediaElement?.error?.message);
  });

  return {
    play,
    seek,
    restart,
    setVolumeControl,
    pause,
    continueStream,
    getDuration: getApproxDuration,
    on: emitter.on,
    off: emitter.off,
  };
}

export function detach() {
  pauseAppending();
  setDefaultEventStates();
  emitter.cleanAll();
  mediaSource = null!;
  sourceBuffer = null!;
  processQueue = null!;
  mediaElement = null!;
  reader = null!;
  currIndex = '';
  seekIndex = '';
}

async function startAppending() {
  const { appendToSourceBuffer } = initSourceBuffer();

  if (!currIndex) {
    await initStream(appendToSourceBuffer);
  }

  processQueue = new AsyncQueue({ indexed: false, waitable: false });
  const append = appendBuffer(appendToSourceBuffer);
  streamTimer = setInterval(() => processQueue.enqueue(append), settings.timeslice);

  await sleep(settings.initBufferTime);
  mediaElement.play();

  emitEvent(EVENTS.IS_PLAYING_CHANGE, true);
  emitEvent(EVENTS.LOADING_PLAYING_CHANGE, false);
}

function continueAppending() {
  const { appendToSourceBuffer } = initSourceBuffer();

  const append = appendBuffer(appendToSourceBuffer);
  streamTimer = setInterval(() => processQueue.enqueue(append), settings.timeslice);

  mediaElement.play();

  emitEvent(EVENTS.IS_PLAYING_CHANGE, true);
}

function pauseAppending() {
  if (streamTimer) {
    clearInterval(streamTimer);
    streamTimer = null;
  }
}

async function initStream(appendToSourceBuffer: (data: Uint8Array) => void) {
  const firstCluster = (await findFirstCluster())!;
  currIndex = firstCluster.feedIndex;
  const initSegment = await createInitSegment(firstCluster.clusterIdIndex, firstCluster.segment);
  setMediaCurrentTime(initSegment);
  appendToSourceBuffer(initSegment);
}

function appendBuffer(appendToSourceBuffer: (data: Uint8Array) => void) {
  return async () => {
    await loadSegmentBuffer(currIndex);

    if (segmentBuffer[currIndex]?.loading || segmentBuffer[currIndex]?.error) {
      return;
    }

    appendToSourceBuffer(segmentBuffer[currIndex].segment!);
    delete segmentBuffer[currIndex];

    currIndex = incrementHexString(currIndex);
  };
}

function loadSegmentBuffer(currIndex: string) {
  // num of parallel soc requests
  const requestNum = 2;
  let promiseIndex = currIndex;

  return new Promise<void>((resolve, reject) => {
    for (let i = 0; i < requestNum; i++) {
      const currentIndex = promiseIndex;

      if (segmentBuffer[currentIndex]?.loading || segmentBuffer[currentIndex]?.segment) {
        promiseIndex = incrementHexString(promiseIndex);
        continue;
      }

      segmentBuffer[currentIndex] = {
        loading: true,
        segment: null,
        error: null,
      };

      reader
        .download({ index: currentIndex })
        .then((res) => {
          bee
            .downloadData(res.reference)
            .then((segment) => {
              segmentBuffer[currentIndex] = {
                loading: false,
                segment,
                error: null,
              };
            })
            .catch((error) => {
              if (error.status !== 404) {
                console.error('Error with reader:', error);
              }
              segmentBuffer[currentIndex] = {
                loading: false,
                segment: null,
                error,
              };
              reject();
            });
        })
        .catch((error) => {
          if (error.status !== 404) {
            console.error('Error with reader:', error);
          }
          segmentBuffer[currentIndex] = {
            loading: false,
            segment: null,
            error,
          };
          reject();
        });

      promiseIndex = incrementHexString(promiseIndex);
    }

    resolve();
  });
}

function initSourceBuffer() {
  const mimeType = 'video/webm; codecs="vp9,opus"';
  // internal queue for sourceBuffer
  const bufferQueue: Uint8Array[] = [];

  if (!sourceBuffer) {
    sourceBuffer = mediaSource.addSourceBuffer(mimeType);
    sourceBuffer.mode = 'segments';

    sourceBuffer.addEventListener('updateend', () => {
      if (bufferQueue.length > 0) {
        const nextData = bufferQueue.shift()!;
        sourceBuffer.appendBuffer(nextData);
      }
    });
  }

  const appendToSourceBuffer = (data: Uint8Array) => {
    if (sourceBuffer.updating || bufferQueue.length > 0) {
      bufferQueue.push(data);
    } else {
      sourceBuffer.appendBuffer(data);
    }
  };

  return { appendToSourceBuffer };
}

function setMediaCurrentTime(clusterSegment: Uint8Array) {
  const timestamp = getClusterTimestampInSeconds(clusterSegment);
  mediaElement.currentTime = timestamp;
}

async function createInitSegment(clusterStartIndex: number, segment: Data) {
  const metaFeedUpdateRes = await reader.download({ index: FIRST_SEGMENT_INDEX });
  const meta = await bee.downloadData(metaFeedUpdateRes.reference);
  setPlayerOptions({ timeslice: getTimestampScaleInSeconds(meta) });

  const initSegment = addMetaToClusterStartSegment(clusterStartIndex, meta, segment);
  return initSegment;
}

async function findFirstCluster() {
  let UNTIL_CLUSTER_IS_FOUND = true;
  while (UNTIL_CLUSTER_IS_FOUND) {
    try {
      const feedUpdateRes = await reader.download(seekIndex ? { index: seekIndex } : undefined);
      const segment = await retryAwaitableAsync(() => bee.downloadData(feedUpdateRes.reference));

      const clusterIdIndex = findHexInUint8Array(segment, CLUSTER_ID);

      if (clusterIdIndex !== -1) {
        UNTIL_CLUSTER_IS_FOUND = false;
        seekIndex = '';
        return {
          feedIndex: feedUpdateRes.feedIndexNext || incrementHexString(feedUpdateRes.feedIndex as string),
          clusterIdIndex,
          segment,
        };
      }

      if (seekIndex) {
        seekIndex = decrementHexString(seekIndex);
      }
    } catch (error) {
      // nothing for now
    } finally {
      await sleep(settings.timeslice);
    }
  }
}

function addMetaToClusterStartSegment(clusterStartIndex: number, meta: Data, segment: Data): Uint8Array {
  const clusterData = segment.slice(clusterStartIndex);
  const metaAndClusterArray = new Uint8Array(meta.length + clusterData.length);
  metaAndClusterArray.set(meta);
  metaAndClusterArray.set(clusterData, meta.length);
  return metaAndClusterArray;
}

function getClusterTimestampInSeconds(segment: Uint8Array) {
  const index = findHexInUint8Array(segment, CLUSTER_TIMESTAMP);
  const vint = parseVint(segment, index + CLUSTER_TIMESTAMP.length / 2);
  return vint.value / 1000;
}

function getTimestampScaleInSeconds(segment: Uint8Array) {
  const index = findHexInUint8Array(segment, TIMESTAMP_SCALE);
  const vint = parseVint(segment, index + TIMESTAMP_SCALE.length / 2);
  return vint.value / 1000;
}

function setSeekIndex(index: number) {
  seekIndex = index.toString(HEX_RADIX).padStart(HEX_RADIX, '0');
}

async function cleanSourceBuffer() {
  pauseAppending();
  await processQueue.clearQueue();
  sourceBuffer = null!;
  currIndex = '';
}

function emitEvent(event: string, value: any) {
  if (eventStates[event] !== value) {
    eventStates[event] = value;
    emitter.emit(event, value);
  }
}

function setDefaultEventStates() {
  Object.keys(eventStates).map((k) => {
    eventStates[k] = false;
  });
}

// TODO
/* function handleBuffering() {
  const bufferTimeRanges = sourceBuffer.buffered;
  const bufferEnd = bufferTimeRanges.end(bufferTimeRanges.length - 1);
  const diff = bufferEnd - mediaElement.currentTime;

  if (settings.buffer > 0) {
    return;
  }

  if (diff <= settings.minLiveThreshold) {
    mediaElement.pause();
    console.log('Buffering...');
    setPlayerOptions({ buffer: 5 + settings.dynamicBufferIncrement, dynamicBufferIncrement: settings.buffer / 2 });
  } else if (mediaElement.paused && diff >= settings.minLiveThreshold) {
    mediaElement.play();
    // console.log('Buffering complete');
  }

  setPlayerOptions({ buffer: settings.buffer - 1 });
} */

import { BatchId, Bee, FeedIndex, FeedWriter, Topic } from '@ethersphere/bee-js';

import { retryAwaitableAsync } from '../utils/common';
import { CLUSTER_ID } from '../utils/constants';
import { findHexInUint8Array } from '../utils/webm';

import { AsyncQueue } from './asyncQueue';
import BeeWrapper from './bee';

interface Signer {
  address: string;
  key: string;
}

interface Options {
  video: boolean;
  audio: boolean;
  timeslice: number;
  videoBitsPerSecond: number;
}

export const streamBee = new BeeWrapper();
let bee: Bee;
let feedWriter: FeedWriter;
let mediaRecorder: MediaRecorder;
let mediaStream: MediaStream;

export async function startStream(signer: Signer, topic: string, stamp: BatchId, options: Options): Promise<void> {
  try {
    bee = streamBee.getBee();
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: options.video,
      audio: options.audio,
    });

    mediaRecorder = new MediaRecorder(mediaStream, {
      mimeType: 'video/webm; codecs=vp9,opus',
      videoBitsPerSecond: options.videoBitsPerSecond,
    });

    await initFeed(signer, topic, stamp);
    const queue = new AsyncQueue({ indexed: true, waitable: true });

    let isFirstSegment = true;
    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        const segment = new Uint8Array(await event.data.arrayBuffer());

        if (isFirstSegment) {
          queue.enqueue((index?: FeedIndex) => uploadSegment(stamp, createInitData(segment), index!));
          isFirstSegment = false;
        }

        queue.enqueue((index?: FeedIndex) => uploadSegment(stamp, segment, index!));
      }
    };

    mediaRecorder.start(options.timeslice);
  } catch (error) {
    stopStream();
    throw error;
  }
}

export function stopStream() {
  mediaRecorder.stop();
  mediaStream.getTracks().forEach((track) => track.stop());
}

export function isStreamOngoing() {
  return mediaStream?.getTracks().some((track) => track.readyState === 'live');
}

async function uploadSegment(stamp: BatchId, segment: Uint8Array, index: FeedIndex) {
  // TODO: bee-js does not support redundancy level yet with uploadPayload
  //const res = await retryAwaitableAsync(() => bee.uploadData(stamp, segment, { redundancyLevel: 1 }));
  //console.log(`Uploaded segment ${index} with reference ${res.reference}`);
  await retryAwaitableAsync(() =>
    feedWriter.uploadPayload(stamp, segment, {
      index,
    }),
  );
}

async function initFeed(signer: Signer, rawTopic: string, stamp: BatchId) {
  const topic = Topic.fromString(rawTopic);
  await bee.createFeedManifest(stamp, topic, signer.address);
  feedWriter = bee.makeFeedWriter(topic, signer.key);
}

function createInitData(segment: Uint8Array) {
  const clusterStartIndex = findHexInUint8Array(segment, CLUSTER_ID);
  const meta = segment.slice(0, clusterStartIndex);
  return meta;
}

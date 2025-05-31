# Swarm Stream JS

`swarm-stream-js` is a JavaScript library that enables real-time media streaming and playback (watching/listening) over the [Swarm decentralized storage network](https://www.ethswarm.org/).

## Table of Contents

- [How It Works](#how-it-works)
  - [Streamer Side](#streamer-side)
  - [Player Side](#player-side)
- [Installation](#installation)
- [Usage](#usage)
  - [Player (Watch a Stream)](#player-watch-a-stream)
  - [Streamer (Start a Stream)](#streamer-start-a-stream)
- [API Reference](#api-reference)
  - [Common](#common)
  - [Player](#player)
  - [Streamer](#streamer)
- [Browser Prerequisites & Limitations](#browser-prerequisites--limitations)
- [Demo Project](#demo-project)
- [Helpful Documents](#helpful-documents)
- [Contributing](#contributing)
- [License](#license)

## How It Works

### Streamer Side

1.  A new Swarm feed is created for the stream.
2.  Each media segment captured from the `MediaRecorder` API is uploaded to this Swarm feed under a specific, manually incremented feed index. This manual indexing is used to avoid feed lookup delays.
3.  Feed index `0` is reserved for storing the stream's metadata. This metadata is crucial for initializing the `MediaSource` on the player side.

### Player Side

1.  The player begins by retrieving the stream metadata from feed index `0` of the specified Swarm feed.
2.  It then waits for a "cluster start" (which typically means waiting for a keyframe) to ensure the media segment is clean and playable.
3.  Once a suitable starting segment is received and the cluster is established, the player starts appending subsequent media segments in order as they are fetched from the Swarm feed.

## Installation

```bash
pnpm/npm install swarm-stream-js
```

## Usage

### Player (Watch a Stream)

To play a stream, first initialize a Bee node instance that the player will use for all Swarm communications. Then, use the `attach` function to connect to a media element and start receiving the stream.

```typescript
import { playerBee, attach, EVENTS } from 'swarm-stream-js';

// Initialize the Bee client for the player
// This should point to your Swarm Bee node API endpoint.
playerBee.setBee('http://localhost:1633'); // Or your public Bee gateway

// Assuming you have a <video> element reference, the stream owner's Swarm address,
// and the unique topic for the stream.
const videoRef = document.getElementById('my-video-player'); // Example: <video id="my-video-player"></video>
const ownerAddress = '0xYourStreamerSwarmAddress...'; // Swarm address of the streamer
const streamTopic = 'unique-stream-topic-name'; // The topic the streamer is using

const controls = attach({
  media: videoRef,
  address: ownerAddress,
  topic: streamTopic,
});

// Available controls and methods:
// controls.play(): Starts or resumes playback.
// controls.pause(): Pauses playback.
// controls.seek(timeInSeconds: number): Seeks to a specific time (note: seeking capabilities depend on stream type and buffering.
// controls.restart(): Restarts the stream from the beginning (may re-fetch initial segments).
// controls.setVolumeControl(volume: number): Sets the volume (0.0 to 1.0).
// controls.continueStream(): Can be used to resume fetching/buffering if paused or interrupted.
// controls.getDuration(): number; Returns the current known duration of the stream.
// controls.on(eventName: string, callback: Function): Subscribes to player events.
// controls.off(eventName:string, callback: Function): Unsubscribes from player events.

// Example: Listen to events
controls.on(EVENTS.IS_PLAYING_CHANGE, (isPlaying: boolean) => {
  console.log(isPlaying ? 'Playback started.' : 'Playback paused/stopped.');
});

controls.on(EVENTS.LOADING_PLAYING_CHANGE, (isLoading: boolean) => {
  console.log(isLoading ? 'Player is loading data...' : 'Player is not in a loading state.');
});

// Available Event Names (via EVENTS object)
// EVENTS.LOADING_PLAYING_CHANGE - Fires when the loading state related to playback changes.
// EVENTS.LOADING_DURATION_CHANGE - Fires when the loading state related to duration changes.
// EVENTS.IS_PLAYING_CHANGE - Fires when the playback state (playing/paused) changes.
```

### Streamer (Start a Stream)

To stream your media, initialize a Bee node instance for the streamer. This node will handle uploading media segments to Swarm.

```typescript
import { isStreamOngoing, startStream, stopStream, streamBee, BatchId } from 'swarm-stream-js';
import { Signer } from 'ethers'; // Example: Signer from ethers.js

// Initialize the Bee client for the streamer
// This should point to your Swarm Bee node API endpoint with write access.
streamBee.setBee('http://localhost:1633');

// --- Configuration Variables ---
// let signer: Signer; // An ethers.js Signer or a compatible object with { address: string; sign: (digest: Uint8Array) => Promise<Uint8Array> }
// This is required to create and update Swarm Feeds.
// const topic = 'unique-stream-topic-name'; // A unique name for your stream's feed.
// const postageStampId: BatchId = 'yourSwarmPostageBatchId'; // A valid Swarm Postage Batch ID with sufficient balance for uploads.

const streamOptions = {
  video: true, // Stream video
  audio: true, // Stream audio
  timeslice: 2000, // Interval in ms to create media segments (currently fixed at 2000ms by the library)
  videoBitsPerSecond: 2500000, // Target video quality (e.g., 2.5 Mbps)
};

async function handleStartStreaming(signer: Signer, topic: string, postageStampId: BatchId) {
  if (isStreamOngoing()) {
    console.log('Stream is already ongoing.');
    return;
  }
  try {
    await startStream(signer, topic, postageStampId, streamOptions);
    console.log('Stream started successfully!');
  } catch (error) {
    console.error('Failed to start stream:', error);
  }
}

function handleStopStreaming() {
  if (isStreamOngoing()) {
    stopStream();
    console.log('Stream stopped.');
  }
}

// Example usage (ensure signer, topic, and postageStampId are properly initialized):
// handleStartStreaming(mySigner, myTopic, myStamp);
// setTimeout(handleStopStreaming, 60000); // Stop streaming after 60 seconds for example
```

## API Reference

### Common

- `BatchId`: A type alias for `string` representing a Swarm Postage Stamp Batch ID.

### Player

- `playerBee.setBee(beeApiUrl: string): void`
  - Sets the Bee node API URL for all player-related Swarm requests.
- `attach(options: AttachOptions): PlayerControls`
  - `AttachOptions`:
    - `media: HTMLMediaElement`: The `<video>` or `<audio>` element to attach the stream to.
    - `address: string`: The Swarm address of the feed owner (the streamer).
    - `topic: string`: The unique topic name of the stream's feed.
  - `PlayerControls`: An object with methods to control playback:
    - `play(): void`
    - `pause(): void`
    - `seek(time: number): void`
    - `restart(): void`
    - `setVolumeControl(volume: number): void` (volume: 0.0 - 1.0)
    - `continueStream(): void`
    - `getDuration(): number` (returns duration in seconds)
    - `on(eventName: string, callback: (...args: any[]) => void): void`
    - `off(eventName: string, callback: (...args: any[]) => void): void`
- `EVENTS: { LOADING_PLAYING_CHANGE: string; LOADING_DURATION_CHANGE: string; IS_PLAYING_CHANGE: string; }`
  - An object mapping event keys to their string names for use with `controls.on()` and `controls.off()`.

### Streamer

- `streamBee.setBee(beeApiUrl: string): void`
  - Sets the Bee node API URL for all streamer-related Swarm requests.
- `startStream(signer: SignerType, topic: string, stamp: BatchId, options: StreamOptions): Promise<void>`
  - `SignerType`: An object compatible with `{ address: string; sign: (digest: Uint8Array) => Promise<Uint8Array> }`. Typically an `ethers.Signer` instance.
  - `topic`: A unique string name for the feed.
  - `stamp`: A valid Swarm Postage Batch ID (`BatchId`).
  - `StreamOptions`:
    - `video: boolean`: Whether to include video.
    - `audio: boolean`: Whether to include audio.
    - `timeslice: number`: (Currently fixed at 2000ms internally) The interval in ms to segment media.
    - `videoBitsPerSecond: number`: Target video bitrate for quality.
- `stopStream(): void`
  - Stops the ongoing media stream and releases resources.
- `isStreamOngoing(): boolean`
  - Returns `true` if a stream is currently active, `false` otherwise.

## Browser Prerequisites & Limitations

The library currently requires the following browser features and codecs:

- **Supported Media Format:** `video/webm; codecs="vp9,opus"` (The library is specific to the WebM container format with VP9 video and Opus audio codecs).

- **APIs:**

  - `Navigator.mediaDevices`: MediaDevices API (for accessing camera/microphone).
  - `MediaRecorder`: MediaStream Recording API (for capturing and segmenting media).
  - `MediaSource Extensions (MSE)`: For custom media playback.
    - `MediaSource`
    - `SourceBuffer` (specifically for appending WebM segments).

- **Testing:** Primary testing has been conducted using **Google Chrome**. Compatibility with other browsers may vary depending on their support for the above features and codecs.

## Demo Project

A simple example project demonstrating a use case of `swarm-stream-js` can be found here:
[swarm-stream-react-example](https://github.com/Solar-Punk-Ltd/swarm-stream-react-example)

## Helpful Documents

- [Swarm Feeds Documentation](https://docs.ethswarm.org/docs/develop/tools-and-features/feeds#what-are-feeds)
- [The WebM Project](https://www.webmproject.org/)
- [Extensible Binary Meta Language (EBML)](https://en.wikipedia.org/wiki/Extensible_Binary_Meta_Language) - Used by WebM.
````

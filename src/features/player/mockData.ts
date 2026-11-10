import type { YouTubeVideo } from "./types";

/**
 * 開発時専用のモックデータ
 * VITE_USE_MOCK_YOUTUBE=true が設定されている場合のみ参照されます。
 */

export const MOCK_POPULAR_VIDEOS: YouTubeVideo[] = [
  {
    id: "dQw4w9WgXcQ",
    title: "Rick Astley - Never Gonna Give You Up (Official Music Video)",
    description: "The official video for Never Gonna Give You Up by Rick Astley.",
    channelTitle: "Rick Astley",
    channelId: "UCuAXFkgsw1L7xaCfnd5JJOw",
    publishedAt: "2009-10-25T06:57:33Z",
    thumbnails: {
      default: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg", width: 120, height: 90 },
      medium: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg", width: 320, height: 180 },
      high: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", width: 480, height: 360 },
    },
  },
  {
    id: "jfKfPfyJRdk",
    title: "lofi hip hop radio 📚 - beats to relax/study to",
    description: "Peaceful lofi hip hop radio - beats to study/chill/relax.",
    channelTitle: "Lofi Girl",
    channelId: "UCSJ4gkVC6NrvII8umztf0Ow",
    publishedAt: "2022-07-12T00:00:00Z",
    thumbnails: {
      default: { url: "https://i.ytimg.com/vi/jfKfPfyJRdk/default.jpg", width: 120, height: 90 },
      medium: { url: "https://i.ytimg.com/vi/jfKfPfyJRdk/mqdefault.jpg", width: 320, height: 180 },
      high: { url: "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg", width: 480, height: 360 },
    },
  },
  {
    id: "kJQP7kiw5Fk",
    title: "Luis Fonsi - Despacito ft. Daddy Yankee",
    description: "Despacito available on all digital platforms.",
    channelTitle: "Luis Fonsi",
    channelId: "UCLp8RBhQHu9wSsq62j_Md6A",
    publishedAt: "2017-01-13T05:00:02Z",
    thumbnails: {
      default: { url: "https://i.ytimg.com/vi/kJQP7kiw5Fk/default.jpg", width: 120, height: 90 },
      medium: { url: "https://i.ytimg.com/vi/kJQP7kiw5Fk/mqdefault.jpg", width: 320, height: 180 },
      high: { url: "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg", width: 480, height: 360 },
    },
  },
  {
    id: "3JZ_D3ELwOQ",
    title: "10-Minute Full Body Stretch for Better Posture",
    description: "A quick 10 minute daily stretch routine to relieve neck pain and improve posture.",
    channelTitle: "Posture & Wellness Daily",
    channelId: "UCposture_sample",
    publishedAt: "2024-01-15T12:00:00Z",
    thumbnails: {
      default: { url: "https://i.ytimg.com/vi/3JZ_D3ELwOQ/default.jpg", width: 120, height: 90 },
      medium: { url: "https://i.ytimg.com/vi/3JZ_D3ELwOQ/mqdefault.jpg", width: 320, height: 180 },
      high: { url: "https://i.ytimg.com/vi/3JZ_D3ELwOQ/hqdefault.jpg", width: 480, height: 360 },
    },
  },
];

export const MOCK_SEARCH_RESULTS: YouTubeVideo[] = [
  {
    id: "3JZ_D3ELwOQ",
    title: "【10分】首・肩こり解消！スマホ首（ストレートネック）改善ストレッチ",
    description: "デスクワークやスマホの使いすぎで凝り固まった首・肩の筋肉をほぐすストレッチです。",
    channelTitle: "姿勢改善チャンネル",
    channelId: "UCsample_stretch",
    publishedAt: "2024-03-01T09:00:00Z",
    thumbnails: {
      default: { url: "https://i.ytimg.com/vi/3JZ_D3ELwOQ/default.jpg", width: 120, height: 90 },
      medium: { url: "https://i.ytimg.com/vi/3JZ_D3ELwOQ/mqdefault.jpg", width: 320, height: 180 },
      high: { url: "https://i.ytimg.com/vi/3JZ_D3ELwOQ/hqdefault.jpg", width: 480, height: 360 },
    },
  },
  {
    id: "jfKfPfyJRdk",
    title: "作業用・勉強用 集中BGM [Chill Lofi Beats]",
    description: "長時間の作業でもリラックスして姿勢を正しながら集中できるチルBGM。",
    channelTitle: "Relax Beats Lab",
    channelId: "UCsample_bgm",
    publishedAt: "2023-11-20T10:00:00Z",
    thumbnails: {
      default: { url: "https://i.ytimg.com/vi/jfKfPfyJRdk/default.jpg", width: 120, height: 90 },
      medium: { url: "https://i.ytimg.com/vi/jfKfPfyJRdk/mqdefault.jpg", width: 320, height: 180 },
      high: { url: "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg", width: 480, height: 360 },
    },
  },
];

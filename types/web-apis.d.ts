interface Window {
  webkitAudioContext?: typeof AudioContext;
}

interface WakeLockSentinel {
  released: boolean;
  type: "screen";
  release: () => Promise<void>;
  addEventListener: EventTarget["addEventListener"];
  removeEventListener: EventTarget["removeEventListener"];
}

interface WakeLock {
  request: (type: "screen") => Promise<WakeLockSentinel>;
}

interface Navigator {
  wakeLock?: WakeLock;
  standalone?: boolean;
}

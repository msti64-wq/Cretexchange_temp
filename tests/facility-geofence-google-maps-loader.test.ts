import assert from "node:assert/strict";
import test from "node:test";
import {
  GOOGLE_MAPS_CALLBACK_NAME,
  createGoogleMapsLoader,
  type GoogleMapsLibrary,
} from "../client/src/lib/googleMapsLoader";

class FakeScript {
  src = "";
  async = false;
  defer = false;
  dataset: Record<string, string> = {};
  removed = false;
  private listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  remove() {
    this.removed = true;
  }
}

class FakeDocument {
  scripts: FakeScript[] = [];
  head = {
    appendChild: (script: FakeScript) => {
      this.scripts.push(script);
      return script;
    },
  };

  createElement(tagName: string) {
    assert.equal(tagName, "script");
    return new FakeScript();
  }

  querySelector() {
    return this.scripts.find((script) => script.src.includes("maps.googleapis.com/maps/api/js")) ?? null;
  }
}

class FakeMap {}
class FakeCircle {}
class FakePolygon {}

const mapsLibrary: GoogleMapsLibrary = {
  Map: FakeMap as unknown as GoogleMapsLibrary["Map"],
  Circle: FakeCircle as unknown as GoogleMapsLibrary["Circle"],
  Polygon: FakePolygon as unknown as GoogleMapsLibrary["Polygon"],
};

function setup() {
  const runtime: Record<string, any> = {};
  const document = new FakeDocument();
  const loader = createGoogleMapsLoader({
    window: runtime,
    document: document as unknown as Document,
    bootstrapTimeoutMs: 100,
    pollIntervalMs: 1,
  });
  return { runtime, document, loader };
}

function installImportLibrary(runtime: Record<string, any>, implementation: (libraryName: string) => Promise<unknown>) {
  runtime.google = { maps: { importLibrary: implementation } };
}

test("bootstrap callback waits for importLibrary maps before exposing constructors", async () => {
  const { runtime, document, loader } = setup();
  const requestedLibraries: string[] = [];
  const pending = loader.load("test-browser-key");

  assert.equal(runtime.google, undefined);
  assert.equal(document.scripts.length, 1);
  installImportLibrary(runtime, async (libraryName) => {
    requestedLibraries.push(libraryName);
    return mapsLibrary;
  });
  runtime[GOOGLE_MAPS_CALLBACK_NAME]();

  const resolved = await pending;
  assert.equal(resolved.Map, FakeMap);
  assert.deepEqual(requestedLibraries, ["maps"]);
  assert.equal(runtime.google.maps.Map, undefined);
});

test("simultaneous loader calls share one promise and inject one bootstrap script", async () => {
  const { runtime, document, loader } = setup();
  let importCalls = 0;
  const first = loader.load("test-browser-key");
  const second = loader.load("test-browser-key");

  assert.equal(first, second);
  assert.equal(document.scripts.length, 1);
  installImportLibrary(runtime, async () => {
    importCalls += 1;
    return mapsLibrary;
  });
  runtime[GOOGLE_MAPS_CALLBACK_NAME]();
  await Promise.all([first, second]);
  assert.equal(importCalls, 1);
});

test("component remount reuses the resolved maps library without another import or script", async () => {
  const { runtime, document, loader } = setup();
  let importCalls = 0;
  const first = loader.load("test-browser-key");
  installImportLibrary(runtime, async () => {
    importCalls += 1;
    return mapsLibrary;
  });
  runtime[GOOGLE_MAPS_CALLBACK_NAME]();
  await first;

  const remount = loader.load("test-browser-key");
  assert.equal(remount, first);
  assert.equal(await remount, mapsLibrary);
  assert.equal(document.scripts.length, 1);
  assert.equal(importCalls, 1);
});

test("script load does not signal readiness and callback remains callable until Google invokes it", async () => {
  const { runtime, document, loader } = setup();
  let resolved = false;
  const pending = loader.load("test-browser-key").then((library) => {
    resolved = true;
    return library;
  });

  document.scripts[0].dispatch("load");
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.equal(typeof runtime[GOOGLE_MAPS_CALLBACK_NAME], "function");

  installImportLibrary(runtime, async () => mapsLibrary);
  runtime[GOOGLE_MAPS_CALLBACK_NAME]();
  await pending;
  assert.equal(runtime[GOOGLE_MAPS_CALLBACK_NAME], undefined);
});

test("bootstrap failure rejects cleanly and removes its callback and failed script", async () => {
  const { runtime, document, loader } = setup();
  const pending = loader.load("test-browser-key");

  document.scripts[0].dispatch("error");
  await assert.rejects(pending, /bootstrap failed/i);
  assert.equal(runtime[GOOGLE_MAPS_CALLBACK_NAME], undefined);
  assert.equal(document.scripts[0].removed, true);
});

test("maps library failure rejects for controlled component error handling", async () => {
  const { runtime, loader } = setup();
  const pending = loader.load("test-browser-key");
  installImportLibrary(runtime, async () => {
    throw new Error("library unavailable");
  });
  runtime[GOOGLE_MAPS_CALLBACK_NAME]();

  await assert.rejects(pending, /library unavailable/);
});

test("loader requests no Places library and never duplicates an existing Maps bootstrap", async () => {
  const { runtime, document, loader } = setup();
  const pending = loader.load("test-browser-key");
  const script = document.scripts[0];

  assert.match(script.src, /loading=async/);
  assert.match(script.src, new RegExp(`callback=${GOOGLE_MAPS_CALLBACK_NAME}`));
  assert.doesNotMatch(script.src, /libraries=places|places/i);
  assert.equal(document.scripts.length, 1);

  installImportLibrary(runtime, async () => mapsLibrary);
  runtime[GOOGLE_MAPS_CALLBACK_NAME]();
  await pending;
  await loader.load("test-browser-key");
  assert.equal(document.scripts.length, 1);
});

test("an in-flight existing Maps bootstrap is awaited without duplicate injection", async () => {
  const { runtime, document, loader } = setup();
  const existing = new FakeScript();
  existing.src = "https://maps.googleapis.com/maps/api/js?key=existing&loading=async&callback=existingCallback";
  document.scripts.push(existing);

  const pending = loader.load("test-browser-key");
  assert.equal(document.scripts.length, 1);
  installImportLibrary(runtime, async () => mapsLibrary);

  assert.equal(await pending, mapsLibrary);
  assert.equal(document.scripts.length, 1);
});

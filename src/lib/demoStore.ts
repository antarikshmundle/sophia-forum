"use client";

import { useSyncExternalStore } from "react";
import { STATIC_EVENTS, type EventItem } from "@/data/staticEvents";
import { GALLERY_PHOTOS, STATIC_VIDEOS, type GalleryMediaItem } from "@/data/staticGallery";
import { STATIC_TEAM, type TeamMember } from "@/data/staticTeam";
import { STATIC_FACULTY, type FacultyMember } from "@/data/staticFaculty";
import { SEED_HASH_FIELD, hashSeed, resolveStore } from "@/lib/demoStoreMigration";

/**
 * MOCK DATA STORE for the local admin demo.
 * Seeded from copies of the static datasets and saved only to this browser's
 * localStorage. Changes never reach the public pages or any server.
 */

export type UserRole = "admin" | "manager" | "member";

export interface DemoUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface DemoCollections {
  events: EventItem[];
  gallery: GalleryMediaItem[];
  team: TeamMember[];
  faculty: FacultyMember[];
  users: DemoUser[];
}

export type CollectionKey = keyof DemoCollections;

/**
 * The store records the hash of the seed it was built from; when src/data changes it is rebuilt once as the
 * current seed plus the records the user created (see demoStoreMigration.ts). "Reset demo data" clears it.
 */
const STORAGE_KEY = "sophia-demo-store-v1";

const createSeed = (): DemoCollections =>
  structuredClone({
    events: STATIC_EVENTS,
    gallery: [...GALLERY_PHOTOS, ...STATIC_VIDEOS],
    team: STATIC_TEAM,
    faculty: STATIC_FACULTY,
    users: [
      { id: "demo-admin", email: "admin@demo.local", name: "Demo Admin", role: "admin" },
      { id: "demo-manager", email: "manager@demo.local", name: "Demo Manager", role: "manager" },
      { id: "demo-member", email: "member@demo.local", name: "Demo Member", role: "member" },
    ],
  });

const SERVER_SNAPSHOT = createSeed();
const SEED_HASH = hashSeed(SERVER_SNAPSHOT);
let cache: DemoCollections | null = null;
const listeners = new Set<() => void>();

function persist(collections: DemoCollections) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...collections, [SEED_HASH_FIELD]: SEED_HASH }));
  } catch {
    // Storage unavailable (private mode / quota); changes stay in memory for this tab
  }
}

function read(): DemoCollections {
  if (cache) return cache;
  const seed = createSeed();
  try {
    const storage = window.localStorage;
    const resolved = resolveStore(storage.getItem(STORAGE_KEY), seed, SEED_HASH);
    cache = resolved.collections;
    if (resolved.persist) persist(cache);
  } catch {
    cache = seed;
  }
  return cache;
}

function write(next: DemoCollections) {
  cache = next;
  persist(next);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useDemoCollection<K extends CollectionKey>(key: K): DemoCollections[K] {
  return useSyncExternalStore(
    subscribe,
    () => read()[key],
    () => SERVER_SNAPSHOT[key]
  );
}

export function setDemoCollection<K extends CollectionKey>(key: K, items: DemoCollections[K]) {
  write({ ...read(), [key]: items });
}

export function resetDemoStore() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  write(createSeed());
}

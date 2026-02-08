import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TRIPS_STORAGE_KEY = '@goingplaces_trips';
const CHAT_API_BASE = process.env.EXPO_PUBLIC_CHAT_WS_BASE ?? 'http://localhost:8000';

export type TripStatus = 'planning' | 'booked' | 'live' | 'done';

/** A single activity within a day (e.g. "Breakfast at Café", "Hike Pfeiffer Falls") */
export type ItineraryActivity = {
  id: string;
  time?: string;
  title: string;
  description?: string;
  location?: string;
};

/** One day of the trip with a list of activities */
export type ItineraryDay = {
  id: string;
  dayNumber: number;
  title: string;
  date?: string;
  activities: ItineraryActivity[];
};

export type Itinerary = ItineraryDay[];

export type Trip = {
  id: string;
  name: string;
  destination: string;
  startDate?: number;
  endDate?: number;
  startingCity?: string;
  status: TripStatus;
  coverImage?: string;
  createdBy: string;
  createdAt: number;
  members?: { id: string; name: string; avatar?: string }[];
  /** Pre-filled itinerary (e.g. from a recommended template) */
  itinerary?: Itinerary;
};

type TripsContextType = {
  trips: Trip[];
  addTrip: (trip: Omit<Trip, 'id' | 'createdAt'>, userId?: string) => string;
  joinTrip: (tripId: string, options?: { name?: string; destination?: string; userId?: string }) => void;
  getTrip: (id: string) => Trip | undefined;
  updateTrip: (id: string, updates: Partial<Omit<Trip, 'id' | 'createdAt'>>) => void;
  fetchUserTrips: (userId: string) => Promise<void>;
  isLoading: boolean;
};

const TripsContext = createContext<TripsContextType | null>(null);

let tripIdCounter = 1;

export function TripsProvider({ children }: { children: React.ReactNode }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load trips from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(TRIPS_STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const savedTrips = JSON.parse(raw);
          setTrips(savedTrips);
        } catch (e) {
          console.error('Failed to load trips from storage:', e);
        }
      }
    });
  }, []);

  // Save trips to AsyncStorage whenever they change
  useEffect(() => {
    AsyncStorage.setItem(TRIPS_STORAGE_KEY, JSON.stringify(trips)).catch((e) => {
      console.error('Failed to save trips to storage:', e);
    });
  }, [trips]);

  const fetchUserTrips = useCallback(async (userId: string) => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const base = CHAT_API_BASE.replace(/\/$/, '');
      const res = await fetch(`${base}/users/${encodeURIComponent(userId)}/trips`);
      if (res.ok) {
        const userTrips = await res.json();
        // Merge with existing trips
        setTrips((prev) => {
          const newTrips = [...prev];
          for (const ut of userTrips) {
            if (!newTrips.some((t) => t.id === ut.trip_id)) {
              newTrips.push({
                id: ut.trip_id,
                name: ut.name,
                destination: ut.destination,
                status: 'planning',
                createdBy: 'unknown',
                createdAt: new Date(ut.joined_at).getTime(),
              });
            }
          }
          return newTrips;
        });
      }
    } catch (e) {
      console.error('Failed to fetch user trips:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addTrip = useCallback((trip: Omit<Trip, 'id' | 'createdAt'>, userId?: string) => {
    const id = `trip_${tripIdCounter++}`;
    const now = Date.now();
    const newTrip: Trip = {
      ...trip,
      id,
      createdAt: now,
    };
    setTrips((prev) => [newTrip, ...prev]);

    // Register membership with backend if userId is provided
    if (userId) {
      const base = CHAT_API_BASE.replace(/\/$/, '');
      fetch(`${base}/trips/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip_id: id,
          user_id: userId,
          name: newTrip.name,
          destination: newTrip.destination,
        }),
      }).catch((e) => console.error('Failed to register trip membership:', e));
    }

    return id;
  }, []);

  const getTrip = useCallback(
    (id: string) => trips.find((t) => t.id === id),
    [trips]
  );

  const joinTrip = useCallback((tripId: string, options?: { name?: string; destination?: string; userId?: string }) => {
    setTrips((prev) => {
      if (prev.some((t) => t.id === tripId)) return prev;
      const now = Date.now();
      const newTrip: Trip = {
        id: tripId,
        name: options?.name ?? 'Joined Trip',
        destination: options?.destination ?? 'TBD',
        status: 'planning',
        createdBy: 'unknown',
        createdAt: now,
      };
      // Remove any existing trip with same id (handles double-call from Strict Mode / deep link)
      return [newTrip, ...prev.filter((t) => t.id !== tripId)];
    });

    // Register membership with backend if userId is provided
    if (options?.userId) {
      const base = CHAT_API_BASE.replace(/\/$/, '');
      fetch(`${base}/trips/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip_id: tripId,
          user_id: options.userId,
          name: options.name,
          destination: options.destination,
        }),
      }).catch((e) => console.error('Failed to register trip membership:', e));
    }
  }, []);

  const updateTrip = useCallback((id: string, updates: Partial<Omit<Trip, 'id' | 'createdAt'>>) => {
    setTrips((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  }, []);

  return (
    <TripsContext.Provider value={{ trips, addTrip, joinTrip, getTrip, updateTrip, fetchUserTrips, isLoading }}>
      {children}
    </TripsContext.Provider>
  );
}

export function useTrips() {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error('useTrips must be within TripsProvider');
  return ctx;
}

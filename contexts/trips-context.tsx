import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useUser } from '@/contexts/user-context';

const GUEST_ID_KEY = '@goingplaces_guest_id';
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
  tripsLoading: boolean;
  /** Stable user id for API (logged-in user or guest id). Use for create/join. */
  effectiveUserId: string | null;
  addTrip: (trip: Omit<Trip, 'id' | 'createdAt'>) => string;
  joinTrip: (tripId: string, options?: { name?: string; destination?: string }) => void;
  /** Add a trip returned from the API (e.g. after create or join). */
  addTripFromApi: (trip: Trip) => void;
  refetchTrips: () => Promise<void>;
  getTrip: (id: string) => Trip | undefined;
  updateTrip: (id: string, updates: Partial<Omit<Trip, 'id' | 'createdAt'>>) => void;
};

const TripsContext = createContext<TripsContextType | null>(null);

let tripIdCounter = 1;

function apiTripToLocal(api: { id: string; name: string; destination: string; status: string; createdBy: string; createdAt: number }): Trip {
  return {
    id: api.id,
    name: api.name,
    destination: api.destination,
    status: api.status as TripStatus,
    createdBy: api.createdBy,
    createdAt: api.createdAt,
  };
}

export function TripsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [guestId, setGuestId] = useState<string | null>(null);
  const effectiveUserId = user?.id ?? guestId;

  useEffect(() => {
    AsyncStorage.getItem(GUEST_ID_KEY).then((id) => {
      if (id) {
        setGuestId(id);
      } else {
        const newId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        AsyncStorage.setItem(GUEST_ID_KEY, newId);
        setGuestId(newId);
      }
    });
  }, []);

  const refetchTrips = useCallback(async () => {
    if (!CHAT_API_BASE || !effectiveUserId) {
      setTripsLoading(false);
      return;
    }
    setTripsLoading(true);
    try {
      const base = CHAT_API_BASE.replace(/\/$/, '');
      const res = await fetch(`${base}/users/${encodeURIComponent(effectiveUserId)}/trips`);
      if (res.ok) {
        const data = await res.json();
        setTrips(Array.isArray(data) ? data.map(apiTripToLocal) : []);
      }
    } catch {
      setTrips([]);
    } finally {
      setTripsLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    refetchTrips();
  }, [refetchTrips]);

  const addTrip = useCallback((trip: Omit<Trip, 'id' | 'createdAt'>) => {
    const id = `trip_${tripIdCounter++}`;
    const now = Date.now();
    const newTrip: Trip = {
      ...trip,
      id,
      createdAt: now,
    };
    setTrips((prev) => [newTrip, ...prev]);
    return id;
  }, []);

  const addTripFromApi = useCallback((trip: Trip) => {
    setTrips((prev) => [trip, ...prev.filter((t) => t.id !== trip.id)]);
  }, []);

  const getTrip = useCallback(
    (id: string) => trips.find((t) => t.id === id),
    [trips]
  );

  const joinTrip = useCallback((tripId: string, options?: { name?: string; destination?: string }) => {
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
      return [newTrip, ...prev.filter((t) => t.id !== tripId)];
    });
  }, []);

  const updateTrip = useCallback((id: string, updates: Partial<Omit<Trip, 'id' | 'createdAt'>>) => {
    setTrips((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  }, []);

  return (
    <TripsContext.Provider
      value={{
        trips,
        tripsLoading,
        effectiveUserId,
        addTrip,
        joinTrip,
        addTripFromApi,
        refetchTrips,
        getTrip,
        updateTrip,
      }}>
      {children}
    </TripsContext.Provider>
  );
}

export function useTrips() {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error('useTrips must be within TripsProvider');
  return ctx;
}

import React, { createContext, useCallback, useContext, useState } from 'react';

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
  addTrip: (trip: Omit<Trip, 'id' | 'createdAt'>) => string;
  getTrip: (id: string) => Trip | undefined;
  updateTrip: (id: string, updates: Partial<Omit<Trip, 'id' | 'createdAt'>>) => void;
};

const TripsContext = createContext<TripsContextType | null>(null);

let tripIdCounter = 1;

export function TripsProvider({ children }: { children: React.ReactNode }) {
  const [trips, setTrips] = useState<Trip[]>([]);

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

  const getTrip = useCallback(
    (id: string) => trips.find((t) => t.id === id),
    [trips]
  );

  const updateTrip = useCallback((id: string, updates: Partial<Omit<Trip, 'id' | 'createdAt'>>) => {
    setTrips((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  }, []);

  return (
    <TripsContext.Provider value={{ trips, addTrip, getTrip, updateTrip }}>
      {children}
    </TripsContext.Provider>
  );
}

export function useTrips() {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error('useTrips must be within TripsProvider');
  return ctx;
}

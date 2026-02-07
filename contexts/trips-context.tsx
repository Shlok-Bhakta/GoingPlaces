import React, { createContext, useCallback, useContext, useState } from 'react';

export type TripStatus = 'planning' | 'booked' | 'live' | 'done';

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
};

type TripsContextType = {
  trips: Trip[];
  addTrip: (trip: Omit<Trip, 'id' | 'createdAt'>) => string;
  getTrip: (id: string) => Trip | undefined;
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

  return (
    <TripsContext.Provider value={{ trips, addTrip, getTrip }}>
      {children}
    </TripsContext.Provider>
  );
}

export function useTrips() {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error('useTrips must be within TripsProvider');
  return ctx;
}

import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';

// User hooks
export function useUser(userId: Id<"users"> | undefined) {
  return useQuery(api.users.get, userId ? { userId } : "skip");
}

export function useUsers() {
  return useQuery(api.users.list);
}

export function useCreateUser() {
  return useMutation(api.users.create);
}

// Trip hooks
export function useTrips(userId: Id<"users"> | undefined) {
  return useQuery(api.trips.list, userId ? { userId } : "skip");
}

export function useTrip(tripId: Id<"trips"> | undefined) {
  return useQuery(api.trips.get, tripId ? { tripId } : "skip");
}

export function useTripMembers(tripId: Id<"trips"> | undefined) {
  return useQuery(api.trips.getMembers, tripId ? { tripId } : "skip");
}

export function useCreateTrip() {
  return useMutation(api.trips.create);
}

export function useAddTripMember() {
  return useMutation(api.trips.addMember);
}

export function useUpdateTripStatus() {
  return useMutation(api.trips.updateStatus);
}

// Message hooks
export function useMessages(tripId: Id<"trips"> | undefined) {
  return useQuery(api.messages.list, tripId ? { tripId } : "skip");
}

export function useSendMessage() {
  return useMutation(api.messages.send);
}

export function useSendMessageWithAI() {
  return useAction(api.messages.sendWithAI);
}

// Invite hooks
export function useGenerateInviteLink() {
  return useMutation(api.invites.generateInviteLink);
}

export function useGetTripByToken(token: string | undefined) {
  return useQuery(api.invites.getTripByToken, token ? { token } : "skip");
}

export function useJoinTripByToken() {
  return useMutation(api.invites.joinTripByToken);
}

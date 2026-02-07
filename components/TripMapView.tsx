import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import type { Trip } from '@/contexts/trips-context';

const DESTINATION_COORDS: Record<string, { latitude: number; longitude: number }> = {
  paris: { latitude: 48.8566, longitude: 2.3522 },
  london: { latitude: 51.5074, longitude: -0.1278 },
  'new york': { latitude: 40.7128, longitude: -74.006 },
  tokyo: { latitude: 35.6762, longitude: 139.6503 },
  barcelona: { latitude: 41.3851, longitude: 2.1734 },
  rome: { latitude: 41.9028, longitude: 12.4964 },
  amsterdam: { latitude: 52.3676, longitude: 4.9041 },
  berlin: { latitude: 52.52, longitude: 13.405 },
  dubai: { latitude: 25.2048, longitude: 55.2708 },
  sydney: { latitude: -33.8688, longitude: 151.2093 },
};

function getDestinationCoords(destination: string) {
  const key = destination.trim().toLowerCase();
  return DESTINATION_COORDS[key] ?? DESTINATION_COORDS.paris;
}

type TripMapViewProps = { trip: Trip };

export function TripMapView({ trip }: TripMapViewProps) {
  const coords = getDestinationCoords(trip.destination);

  return (
    <View style={styles.mapContainer}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          ...coords,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        mapType="standard"
        showsUserLocation
        showsMyLocationButton>
        <Marker
          coordinate={coords}
          title={trip.destination}
          description={`Trip: ${trip.name}`}
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    flex: 1,
    minHeight: Dimensions.get('window').height * 0.5,
  },
  map: {
    width: '100%',
    height: '100%',
    minHeight: Dimensions.get('window').height * 0.5,
  },
});

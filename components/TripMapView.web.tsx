import React, { createElement } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import type { Trip } from '@/contexts/trips-context';

type TripMapViewProps = { trip: Trip };

const EMBED_BASE = 'https://www.google.com/maps/embed/v1/place';

export function TripMapView({ trip }: TripMapViewProps) {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const query = encodeURIComponent(trip.destination);
  const embedUrl = apiKey
    ? `${EMBED_BASE}?key=${apiKey}&q=${query}`
    : `https://www.google.com/maps?q=${query}&output=embed`;

  const iframeStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    minHeight: 360,
    border: 0,
    display: 'block',
  };

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' &&
        createElement('iframe', {
          src: embedUrl,
          title: `Map: ${trip.destination}`,
          style: iframeStyle,
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    minHeight: 360,
    height: 360,
    overflow: 'hidden',
  },
});

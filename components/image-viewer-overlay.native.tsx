import { Image } from 'expo-image';
import React from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';

import { IconSymbol } from '@/components/ui/icon-symbol';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  pagerPage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pagerPageInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export type ImageViewerOverlayProps = {
  imageUris: string[];
  initialPage: number;
  onClose: () => void;
};

export default function ImageViewerOverlay({
  imageUris,
  initialPage,
  onClose,
}: ImageViewerOverlayProps) {
  if (imageUris.length === 0) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.92)' }]}>
      <PagerView style={{ flex: 1 }} initialPage={initialPage}>
        {imageUris.map((uri, index) => (
          <View key={`${uri}-${index}`} style={styles.pagerPage} collapsable={false}>
            <Pressable
              style={styles.pagerPageInner}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close image viewer">
              <Image
                source={{ uri }}
                style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
                contentFit="contain"
              />
            </Pressable>
          </View>
        ))}
      </PagerView>
      <View style={{ position: 'absolute', top: 50, right: 20, zIndex: 10 }}>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => ({
            backgroundColor: pressed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.2)',
            width: 40,
            height: 40,
            borderRadius: 20,
            justifyContent: 'center',
            alignItems: 'center',
          })}
          accessibilityRole="button"
          accessibilityLabel="Close image viewer">
          <IconSymbol name="xmark" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

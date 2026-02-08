import { Image } from 'expo-image';
import React, { useEffect, useRef } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';

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
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ x: initialPage * SCREEN_WIDTH, animated: false });
    }
  }, [initialPage]);

  if (imageUris.length === 0) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.92)' }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentOffset={{ x: initialPage * SCREEN_WIDTH, y: 0 }}>
        {imageUris.map((uri, index) => (
          <View key={`${uri}-${index}`} style={[styles.pagerPage, { width: SCREEN_WIDTH }]}>
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
      </ScrollView>
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

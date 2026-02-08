import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';

const DURATION_MS = 220;

export function TabScreenWrapper({ children }: { children: React.ReactNode }) {
  const isFocused = useIsFocused();
  const opacity = useSharedValue(0);
  const prevFocused = useRef(isFocused);
  const [contentKey, setContentKey] = useState(0);

  useEffect(() => {
    if (isFocused) {
      opacity.value = 0;
      opacity.value = withTiming(1, { duration: DURATION_MS });
      if (!prevFocused.current) {
        setContentKey((k) => k + 1);
      }
      prevFocused.current = true;
    } else {
      opacity.value = withTiming(0, { duration: 120 });
      prevFocused.current = false;
    }
  }, [isFocused, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const content =
    React.Children.count(children) === 1 &&
    React.isValidElement(children)
      ? React.cloneElement(children as React.ReactElement<{ key?: React.Key }>, { key: contentKey })
      : children;

  return (
    <Animated.View style={[styles.fill, animatedStyle]} pointerEvents="box-none">
      {content}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});

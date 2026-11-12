import { createContext } from 'react';
import type { NativeGesture } from 'react-native-gesture-handler';

// 图纸手势在原生层阻止外层 ScrollView 抢走同一串触摸。
export const ScrollGestureContext = createContext<NativeGesture | undefined>(undefined);

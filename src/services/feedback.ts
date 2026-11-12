// 本文件提供生成与保存成功后的原生系统提示。
import { Alert, Platform, ToastAndroid } from 'react-native';

// 安卓显示系统短提示；其他平台使用原生提示框。
export function showSuccess(message: string) {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert(message);
}

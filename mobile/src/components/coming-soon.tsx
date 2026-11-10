import { Text, View } from 'react-native';
import { Page, ui } from './page';
export function ComingSoon({ title }: { title: string }) {
  return <Page title={title}><View style={ui.center}><Text style={ui.title}>未完待续</Text></View></Page>;
}

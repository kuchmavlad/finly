import { useState } from 'react';
import { Keyboard, Modal, Platform, ScrollView, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { calendarDate, latestOperationDate, localDateString } from '../domain/calendarDate';
import { Button } from './components';
import { useTheme } from './theme';

export interface OperationDateFieldProps { value: string; onChange(value: string): void; disabled: boolean }

export default function OperationDateField({ value, onChange, disabled }: OperationDateFieldProps) {
  const { styles: s, colors } = useTheme();
  const [selected, setSelected] = useState(() => calendarDate(latestOperationDate()));
  const [visible, setVisible] = useState(false);
  const maximum = latestOperationDate();
  const open = () => {
    Keyboard.dismiss();
    const initial = calendarDate(value && value <= maximum ? value : maximum);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initial, mode: 'date', display: 'calendar',
        minimumDate: calendarDate('1900-01-01'), maximumDate: calendarDate(maximum),
        onValueChange: (_event, date) => onChange(localDateString(date)),
      });
    } else { setSelected(initial); setVisible(true); }
  };
  return <>
    <Button title={value || 'Choose date'} secondary disabled={disabled} onPress={open} />
    <Modal visible={visible && !disabled} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
      <View style={{ flex: 1, backgroundColor: '#0009', justifyContent: 'flex-end' }}>
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.panel, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' }}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
            <Text style={s.heading}>Operation date</Text>
            <DateTimePicker value={selected} mode="date" display="inline" themeVariant="dark"
              minimumDate={calendarDate('1900-01-01')} maximumDate={calendarDate(maximum)}
              onValueChange={(_event, date) => setSelected(date)} />
            <Button title="Use date" onPress={() => { onChange(localDateString(selected)); setVisible(false); }} />
            <Button title="Cancel" secondary onPress={() => setVisible(false)} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </>;
}

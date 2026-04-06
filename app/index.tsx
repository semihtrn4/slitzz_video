import { View } from 'react-native';

export default function Index() {
  // Yönlendirme mantığı \`_layout.tsx\` tarafındaki useEffect ile yönetiliyor (isReady olduktan sonra).
  // Root yüklenmesi esnasında Expo Router'ın eksik rota hatası (Missing Route) vermemesi için boş bir View döndürüyoruz.
  return <View style={{ flex: 1, backgroundColor: '#121212' }} />;
}

import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 30 },
  title: { fontSize: 18, marginBottom: 20, textAlign: 'center' },
  table: { width: '100%' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#ccc', padding: 5 },
  header: { backgroundColor: '#f0f0f0', fontWeight: 'bold' },
  cell: { flex: 1, fontSize: 12 },
  total: { fontWeight: 'bold', backgroundColor: '#e6e6e6' }
});

export async function generatePDF(data: any): Promise<Buffer> {
  const MyDocument = () => (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>
          Statistiques DESPS - {data.identification.anneeScolaire}
        </Text>
        
        <View style={styles.table}>
          <View style={[styles.row, styles.header]}>
            <Text style={styles.cell}>Niveau</Text>
            <Text style={styles.cell}>Garçons</Text>
            <Text style={styles.cell}>Filles</Text>
            <Text style={styles.cell}>Total</Text>
          </View>
          
          {data.effectifs.map((row: any) => (
            <View key={row.niveau} style={styles.row}>
              <Text style={styles.cell}>{row.niveau}</Text>
              <Text style={styles.cell}>{row.garcons}</Text>
              <Text style={styles.cell}>{row.filles}</Text>
              <Text style={styles.cell}>{row.total}</Text>
            </View>
          ))}
          
          <View style={[styles.row, styles.total]}>
            <Text style={styles.cell}>TOTAL</Text>
            <Text style={styles.cell}>{data.totalGeneral.garcons}</Text>
            <Text style={styles.cell}>{data.totalGeneral.filles}</Text>
            <Text style={styles.cell}>{data.totalGeneral.total}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );

  const buffer = await renderToBuffer(<MyDocument />);
  return Buffer.from(buffer);
                         }

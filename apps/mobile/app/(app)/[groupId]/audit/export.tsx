import { Redirect, useLocalSearchParams } from 'expo-router';

// The audit report now lives on Reports & Export, next to the financial report.
export default function ExportAuditReport() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <Redirect href={{ pathname: '/(app)/[groupId]/reports/export' as any, params: { groupId, type: 'audit' } }} />;
}

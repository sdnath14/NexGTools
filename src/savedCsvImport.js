// Adapt saved lead exports to the same preview/import pipeline used by workbooks.
export function csvExportToSheets(exportRecord) {
  return [{
    id: `csv-${exportRecord.id}`,
    name: exportRecord.export_name,
    records: (exportRecord.leads || []).map((lead, index) => ({
      record_number: index + 1,
      record_json: {
        'Company Name': lead.company_name || lead.name || '',
        'Contact Person': lead.contact_person || '',
        Email: lead.email || '',
        Phone: lead.phone || '',
        Website: lead.website || '',
        Category: lead.business_type || lead.category || 'lead_csv',
      },
    })),
  }];
}

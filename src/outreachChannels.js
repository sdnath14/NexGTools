export const hasChannelContact = (lead, channel) => Boolean(String((channel === 'email' ? lead.email : lead.phone) ?? '').trim());

export function generationChannelFor(leads, channel) {
  if (channel === 'email' && !leads.some((lead) => hasChannelContact(lead, 'email')) && leads.some((lead) => hasChannelContact(lead, 'whatsapp'))) return 'whatsapp';
  return channel;
}

export const buildWhatsAppUrl = (message, phoneNumber) => {
  const cleanPhone = String(phoneNumber).replace(/\D/g, '');
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
};

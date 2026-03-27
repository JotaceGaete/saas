import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const DLocalReturnPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState('Confirmando tu pago...');
  
  const paymentId = searchParams.get('paymentId');
  const businessId = localStorage.getItem('businessId'); // O como obtengas el ID actual

  useEffect(() => {
    if (!paymentId) return;

    // Consultamos tu API de suscripción cada 3 segundos
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/billing/subscription-state?businessId=${businessId}`);
        const data = await res.json();

        if (data.billing_status === 'active') {
          setMessage('¡Pago confirmado! Redirigiendo...');
          clearInterval(interval);
          setTimeout(() => navigate('/dashboard'), 2000);
        } else if (data.billing_status === 'rejected' || data.billing_status === 'cancelled') {
          setMessage('El pago fue rechazado. Intenta nuevamente.');
          clearInterval(interval);
        }
      } catch (error) {
        console.error("Error validando estado:", error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [paymentId, businessId, navigate]);

  return (
    <div style={{ textAlign: 'center', marginTop: '50px', fontFamily: 'sans-serif' }}>
      <h2>{message}</h2>
      <p>ID de Transacción: {paymentId}</p>
      <div className="spinner">Cargando...</div> 
    </div>
  );
};

export default DLocalReturnPage;
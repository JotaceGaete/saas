import React from 'react';

const getStrength = (password) => {
  if (!password) return { score: 0, label: '', color: '' };
  let score = 0;
  if (password?.length >= 8) score++;
  if (/[A-Z]/?.test(password)) score++;
  if (/[0-9]/?.test(password)) score++;
  if (/[^A-Za-z0-9]/?.test(password)) score++;

  const levels = [
    { score: 0, label: '', color: '' },
    { score: 1, label: 'Muy débil', color: 'bg-red-400' },
    { score: 2, label: 'Débil', color: 'bg-orange-400' },
    { score: 3, label: 'Buena', color: 'bg-yellow-400' },
    { score: 4, label: 'Fuerte', color: 'bg-green-500' },
  ];
  return levels?.[score];
};

export default function PasswordStrengthIndicator({ password }) {
  const strength = getStrength(password);
  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4]?.map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              i <= strength?.score ? strength?.color : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      {strength?.label && (
        <p
          className="text-xs"
          style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' }}
        >
          Contraseña: <span className="font-medium">{strength?.label}</span>
        </p>
      )}
    </div>
  );
}
// Icônes de contact dessinées localement (aucune ressource externe).
export default function ContactIcon({ platform }: { platform: string }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    className: "contact-icon",
  } as const;
  if (platform === "Snapchat")
    return (
      <svg {...common}>
        <path
          fill="#FFFC00"
          stroke="#111"
          strokeWidth="1"
          d="M12 2.5c3.3 0 5.6 2.5 5.6 5.7v2.2c.5.2 1.1 0 1.6-.2.6-.2 1.1.6.5 1-.6.4-1.6.7-2.2 1 .3 1.6 2 3.4 3.6 3.8.5.1.5.8 0 1-.8.4-1.8.5-2.3.7-.2.5-.2 1.1-.6 1.2-.6.1-1.6-.3-2.6 0-1 .4-1.8 1.6-3.6 1.6s-2.6-1.2-3.6-1.6c-1-.3-2 .1-2.6 0-.4-.1-.4-.7-.6-1.2-.5-.2-1.5-.3-2.3-.7-.5-.2-.5-.9 0-1 1.6-.4 3.3-2.2 3.6-3.8-.6-.3-1.6-.6-2.2-1-.6-.4-.1-1.2.5-1 .5.2 1.1.4 1.6.2V8.2C6.4 5 8.7 2.5 12 2.5z"
        />
      </svg>
    );
  if (platform === "WhatsApp")
    return (
      <svg {...common}>
        <path
          fill="#25D366"
          d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z"
        />
        <path
          fill="#fff"
          d="M8.6 7.2c.2-.4.5-.4.8-.4h.6c.2 0 .4.1.5.4l.8 1.9c.1.3 0 .5-.1.7l-.5.6c-.1.2-.2.4 0 .6.7 1.2 1.6 2 2.8 2.6.2.1.4.1.6-.1l.7-.8c.2-.2.4-.3.7-.2l1.8.9c.3.1.4.3.4.5 0 .5-.2 1.4-1 1.9-.6.4-1.5.6-2.9.1-2.3-.9-4.1-2.9-4.9-4.6-.6-1.4-.4-2.6.1-3.1z"
        />
      </svg>
    );
  if (platform === "Telegram")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="10" fill="#2AABEE" />
        <path
          fill="#fff"
          d="M6.2 11.6l9.6-3.7c.5-.2.9.1.7.8l-1.6 7.7c-.1.6-.5.7-1 .4l-2.5-1.8-1.2 1.2c-.1.1-.3.2-.5.2l.2-2.6 4.7-4.3c.2-.2 0-.3-.3-.1l-5.8 3.7-2.5-.8c-.5-.2-.5-.5.2-.7z"
        />
      </svg>
    );
  if (platform === "Téléphone")
    return (
      <svg
        {...common}
        fill="none"
        stroke="#9ad2bc"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
      </svg>
    );
  return (
    <svg
      {...common}
      fill="none"
      stroke="#cfd7e3"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

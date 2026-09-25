interface PrivacyScreenProps {
  message: string;
  buttonLabel: string;
  onReveal: () => void;
}

export function PrivacyScreen({ message, buttonLabel, onReveal }: PrivacyScreenProps) {
  return (
    <div className="privacy">
      <p className="message">{message}</p>
      <button type="button" className="btn" onClick={onReveal}>
        {buttonLabel}
      </button>
    </div>
  );
}

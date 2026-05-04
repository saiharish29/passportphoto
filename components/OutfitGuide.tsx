'use client';

interface Props {
  onContinue: () => void;
  onBack: () => void;
}

const TIPS = [
  {
    icon: '👔',
    title: 'Wear dark, solid colours',
    detail: 'Navy, black, dark green, maroon. Avoid white, beige, or anything that blends with the background.',
  },
  {
    icon: '🚫',
    title: 'No patterns or logos',
    detail: 'Plain shirts/blouses photograph cleanest. Sarees and salwar kameez are fine.',
  },
  {
    icon: '👓',
    title: 'Remove glasses if possible',
    detail: 'If you must wear them, ensure no glare and that both eyes are clearly visible.',
  },
  {
    icon: '💡',
    title: 'Face soft, even light',
    detail: 'A window during daytime works well. Avoid overhead lights that cast eye shadows.',
  },
  {
    icon: '😐',
    title: 'Neutral expression, mouth closed',
    detail: 'Both ears visible if hair allows. Look directly at the camera.',
  },
  {
    icon: '🎩',
    title: 'No hats or headwear',
    detail: 'Religious head coverings are permitted but the full face must be visible from chin to forehead.',
  },
];

export function OutfitGuide({ onContinue, onBack }: Props) {
  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Before you click</h2>
          <p className="text-sm text-ink-700">
            We don&apos;t edit your face or clothing. Get these right now and your photo will be accepted.
          </p>
        </div>

        <ul className="space-y-3">
          {TIPS.map((t) => (
            <li key={t.title} className="flex gap-3">
              <span className="text-2xl leading-none" aria-hidden>
                {t.icon}
              </span>
              <div>
                <div className="font-medium">{t.title}</div>
                <div className="text-sm text-ink-700">{t.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onBack} className="btn-secondary">
          Back
        </button>
        <button type="button" onClick={onContinue} className="btn-primary">
          I&apos;m ready
        </button>
      </div>
    </div>
  );
}

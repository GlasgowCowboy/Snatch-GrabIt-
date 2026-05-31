import { useState } from 'react';
import { Check, Upload, X } from 'lucide-react';

/**
 * 6 preset card-back designs + an optional custom upload. The selected value
 * is either `preset:<id>` (for built-ins) or a data URL (for uploads). Parent
 * stores it the same way it always has (the Profile / Room state both accept
 * a single `cardBackImage` string).
 *
 * Why this exists: the old file-input was cold ("Choose file… No file
 * chosen") and most players don't have a square card-back image lying around.
 * Presets get them to "feels personal" in one tap.
 */

export const CARD_BACK_PRESETS = [
  { id: 'navy', label: 'Midnight' },
  { id: 'gold', label: 'Gold' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'crimson', label: 'Crimson' },
  { id: 'violet', label: 'Violet' },
  { id: 'monochrome', label: 'Mono' },
] as const;

export type CardBackPresetId = (typeof CARD_BACK_PRESETS)[number]['id'];

const MAX_CARD_BACK_BYTES = 1 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

interface CardBackPickerProps {
  value: string;
  onChange: (value: string) => void;
  /** When true, expose an "upload your own" affordance below the preset grid. */
  allowUpload?: boolean;
}

export default function CardBackPicker({ value, onChange, allowUpload = true }: CardBackPickerProps) {
  const [uploadError, setUploadError] = useState<string>('');
  const isCustom = !!value && !value.startsWith('preset:');

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setUploadError('');
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setUploadError(`Unsupported file (${file.type || 'unknown'}). Use JPG, PNG, GIF, or WebP.`);
      e.target.value = '';
      return;
    }
    if (file.size > MAX_CARD_BACK_BYTES) {
      setUploadError(`Image is ${(file.size / 1024 / 1024).toFixed(2)} MB — please choose one under 1 MB.`);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result ?? '');
      onChange(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3" data-testid="card-back-picker">
      {/* Preset grid */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {CARD_BACK_PRESETS.map((p) => {
          const presetValue = `preset:${p.id}`;
          const selected = value === presetValue;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(presetValue)}
              data-testid={`card-back-preset-${p.id}`}
              className={`group relative flex flex-col items-center gap-1 transition-transform active:scale-95`}
              title={p.label}
            >
              <div
                className={`relative w-full aspect-[2/3] rounded-md border-2 overflow-hidden card-back-preset-${p.id} ${
                  selected
                    ? 'border-gold ring-2 ring-gold/50'
                    : 'border-white/10 group-hover:border-gold/40'
                }`}
              >
                {selected && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Check className="w-5 h-5 text-gold drop-shadow" />
                  </div>
                )}
              </div>
              <span className={`text-[10px] uppercase tracking-wide ${selected ? 'text-gold' : 'text-gold-light/60'}`}>
                {p.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Custom upload */}
      {allowUpload && (
        <div className="flex items-center gap-3 pt-2 border-t border-white/5">
          <label
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs cursor-pointer text-gold-light/70 hover:text-gold border border-white/10 hover:border-gold/30 transition-colors"
            title="Upload your own card back image — JPG, PNG, GIF, or WebP, max 1 MB."
          >
            <Upload className="w-3.5 h-3.5" />
            Upload your own
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUpload}
              data-testid="card-back-upload-input"
            />
          </label>

          {isCustom && (
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <div className="w-10 h-14 rounded border border-emerald-500/30 overflow-hidden">
                <img src={value} alt="Your card back" className="w-full h-full object-cover" />
              </div>
              <span>Using custom upload</span>
              <button
                type="button"
                onClick={() => onChange('preset:navy')}
                className="text-muted-foreground hover:text-destructive flex items-center gap-1"
                data-testid="card-back-clear-custom"
              >
                <X className="w-3 h-3" />
                Remove
              </button>
            </div>
          )}

          {uploadError && (
            <p className="text-xs text-destructive" role="alert" data-testid="card-back-upload-error">
              {uploadError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

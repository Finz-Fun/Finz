import React, { useState } from 'react';
import { Button } from '@material-tailwind/react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: { slippageTolerance: number; priorityFee: string | number }) => void;
}

export function SettingsModal({ isOpen, onClose, onSave }: SettingsModalProps) {
  const [slippageTolerance, setSlippageTolerance] = useState<number>(0.5);
  const [customSlippage, setCustomSlippage] = useState<string>('');
  const [priorityFee, setPriorityFee] = useState<string | number>('Normal');
  const [customPriorityFee, setCustomPriorityFee] = useState<string>('');

  const handleSlippageSelect = (value: number) => {
    setSlippageTolerance(value);
    setCustomSlippage('');
  };

  const handleCustomSlippage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || (/^\d*\.?\d*$/.test(value) && parseFloat(value) <= 100)) {
      setCustomSlippage(value);
      if (value !== '') {
        setSlippageTolerance(parseFloat(value));
      }
    }
  };

  const handlePrioritySelect = (value: string | number) => {
    setPriorityFee(value);
    setCustomPriorityFee('');
  };

  const handleCustomPriority = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setCustomPriorityFee(value);
      if (value !== '') {
        setPriorityFee(parseFloat(value));
      }
    }
  };

  const handleSave = () => {
    onSave({
      slippageTolerance,
      priorityFee
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#1d1d1b] rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-white mb-6">Settings</h2>
        
        {/* Slippage Tolerance Section */}
        <div className="mb-6">
          <label className="text-sm text-gray-400 mb-2 block">Slippage Tolerance</label>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {[0.1, 0.5, 1.0].map((value) => (
              <button
                key={value}
                onClick={() => handleSlippageSelect(value)}
                className={`py-2 px-4 rounded-lg text-sm transition-colors
                  ${slippageTolerance === value && customSlippage === ''
                    ? "bg-gray-900 text-white shadow-lg"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white hover:shadow-md"}
                  hover:scale-[1.02] focus:scale-[1.02] active:scale-100`}
              >
                {value}%
              </button>
            ))}
            <div className="relative">
              <input
                type="text"
                value={customSlippage}
                onChange={handleCustomSlippage}
                placeholder="Custom"
                className="w-full py-2 px-4 rounded-lg text-sm bg-gray-800 text-white
                  placeholder-gray-400 focus:outline-none focus:ring-2"
              />
              {customSlippage && (
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">%</span>
              )}
            </div>
          </div>
        </div>

        {/* Priority Fee Section */}
        <div className="mb-6">
          <label className="text-sm text-gray-400 mb-2 block">Priority fee</label>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {['Normal', 'Turbo'].map((value) => (
              <button
                key={value}
                onClick={() => handlePrioritySelect(value)}
                className={`py-2 px-4 rounded-lg text-sm transition-colors
                  ${priorityFee === value && customPriorityFee === ''
                    ? "bg-gray-900 text-white shadow-lg"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white hover:shadow-md"}
                  hover:scale-[1.02] focus:scale-[1.02] active:scale-100`}
              >
                {value}
              </button>
            ))}
            <div className="relative">
              <input
                type="text"
                value={customPriorityFee}
                onChange={handleCustomPriority}
                placeholder="Custom"
                className="w-full py-2 px-4 rounded-lg text-sm bg-gray-800 text-white
                  placeholder-gray-400 focus:outline-none focus:ring-2 "
              />
              {customPriorityFee && (
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">SOL</span>
              )}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-4">
            {/*@ts-ignore*/}
          <Button
            variant="text"
            color="gray"
            onClick={onClose}
            className="text-gray-400 hover:text-white mt-4"
          >
            Cancel
          </Button>
          {/*@ts-ignore*/}
          <Button
            size="sm"
            color="white"
            className="hover:scale-[1.02] focus:scale-[1.02] active:scale-100 flex-1 mt-4"
            ripple={false}
            onClick={handleSave}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
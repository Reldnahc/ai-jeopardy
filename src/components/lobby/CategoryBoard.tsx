import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import LockIcon from "../../icons/LockIcon.tsx";
import RedoIcon from "../../icons/RedoIcon.tsx";

interface CategoryBoardProps {
    title: string;
    categories: string[];
    isHost: boolean;
    lockedCategories: boolean[];
    boardType: 'firstBoard' | 'secondBoard';
    onChangeCategory: (
        boardType: 'firstBoard' | 'secondBoard',
        index: number,
        value: string
    ) => void;
    onRandomizeCategory: (
        boardType: 'firstBoard' | 'secondBoard',
        index: number
    ) => void;
    onToggleLock: (
        boardType: 'firstBoard' | 'secondBoard',
        index: number
    ) => void;
}

const MAX_FONT_PX = 19;  // ~1.2rem at 16px base
const MIN_FONT_PX = 12;  // ~0.75rem
const STEP_PX = 0.5;

function fitInputText(el: HTMLInputElement) {
    // Reset to max size first (important when user deletes text)
    el.style.fontSize = `${MAX_FONT_PX}px`;

    // If it already fits, we're done
    if (el.scrollWidth <= el.clientWidth) return;

    // Shrink until it fits or we hit the minimum
    let size = MAX_FONT_PX;
    while (size > MIN_FONT_PX && el.scrollWidth > el.clientWidth) {
        size -= STEP_PX;
        el.style.fontSize = `${size}px`;
    }
}

const CategoryBoard: React.FC<CategoryBoardProps> = ({
                                                         title,
                                                         categories,
                                                         isHost,
                                                         lockedCategories,
                                                         boardType,
                                                         onChangeCategory,
                                                         onRandomizeCategory,
                                                         onToggleLock,
                                                     }) => {
    // One ref per input
    const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

    // Ensure stable length for refs (so indexes match categories)
    useMemo(() => {
        inputRefs.current = Array(categories.length).fill(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categories.length]);

    // Fit on mount + whenever categories change
    useLayoutEffect(() => {
        inputRefs.current.forEach((el) => {
            if (el) fitInputText(el);
        });
    }, [categories]);

    // Fit on resize (inputs get narrower/wider)
    useEffect(() => {
        const onResize = () => {
            inputRefs.current.forEach((el) => {
                if (el) fitInputText(el);
            });
        };

        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    return (
        <div className="min-w-0">
            <h2 className="text-3xl mb-4 text-black font-bold">{title}</h2>

            {categories.map((category, index) => (
                <div key={index} className="flex items-center mb-3 gap-2.5 flex-nowrap">
                    <input
                        ref={(el) => { inputRefs.current[index] = el; }}
                        type="text"
                        value={category || ''}
                        disabled={lockedCategories[index]}
                        onChange={(e) => {
                            onChangeCategory(boardType, index, e.target.value);
                            if (inputRefs.current[index]) fitInputText(inputRefs.current[index]!);
                        }}
                        placeholder={`Category ${index + 1}`}
                        className={`
                            h-[48px] leading-none p-[10px] rounded border flex-1 min-w-0
                            ${lockedCategories[index]
                            ? "bg-gray-200 text-gray-500 border-gray-400 border-dashed cursor-not-allowed opacity-80"
                            : "bg-gray-50 text-black border-gray-300"}
                        `}
                    />

                    {isHost && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => onToggleLock(boardType, index)}
                                disabled={!isHost}
                                className={`text-[1rem] py-[10px] px-[15px] ${
                                    lockedCategories[index] ? 'bg-red-600' : 'bg-indigo-500'
                                } text-white rounded cursor-pointer`}
                            >
                                <LockIcon />
                            </button>

                            <button
                                onClick={() => onRandomizeCategory(boardType, index)}
                                className="text-[1rem] py-[10px] px-[15px] bg-blue-700 text-white rounded cursor-pointer"
                            >
                                <RedoIcon />
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default CategoryBoard;

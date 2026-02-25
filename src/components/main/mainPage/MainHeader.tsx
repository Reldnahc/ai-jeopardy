import SvgOutlinedText from "../../common/SvgOutlinedText.tsx";

type MainHeaderProps = {
  randomAdjective: string;
};

export default function MainHeader({ randomAdjective }: MainHeaderProps) {
  return (
    <>
      <div className="h-20 md:h-24 lg:h-28 w-full">
        <SvgOutlinedText
          text={`Artificially ${randomAdjective} Jeopardy`}
          className="w-full h-full md:hidden"
          fill="#facc15"
          shadowStyle="board"
          singleLine={false}
          maxLines={3}
          wrapAtChars={22}
          uppercase
        />
        <SvgOutlinedText
          text={`Artificially ${randomAdjective} Jeopardy`}
          className="hidden w-full h-full md:block"
          fill="#facc15"
          shadowStyle="board"
          singleLine
          uppercase
        />
      </div>
      <p className="text-base md:text-lg text-slate-700 text-center mt-1">
        Race to buzz in and answer clues by voice.
      </p>
    </>
  );
}

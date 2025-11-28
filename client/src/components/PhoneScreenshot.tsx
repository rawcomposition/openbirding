import Phone from "./Phone";

type PhoneScreenshotProps = {
  src: string;
  alt: string;
  className?: string;
  phoneClassName?: string;
};

const PhoneScreenshot = ({ src, alt, className = "", phoneClassName = "" }: PhoneScreenshotProps) => {
  return (
    <div className={`relative w-full max-w-[280px] aspect-[433/882] ${className}`}>
      <div className="relative w-full h-full">
        <div className="absolute left-[4.91%] top-[2.18%] w-[89.93%] h-[95.63%] overflow-hidden rounded-xl">
          <img src={src} alt={alt} className="w-full h-full object-cover" />
        </div>
        <Phone className={`relative z-10 pointer-events-none ${phoneClassName}`} />
      </div>
    </div>
  );
};

export default PhoneScreenshot;

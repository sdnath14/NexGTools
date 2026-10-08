import React, { useId } from 'react';
import logo from '../assets/nexgtool-removebg-preview.png';

export default function Brand({ dark = false, tools = false, subtitle = 'Tools' }) {
  const id = useId().replaceAll(':', '');
  const whiteFilter = `brand-white-${id}`, colorClip = `brand-colors-${id}`, whiteClip = `brand-lettering-${id}`;
  return <span className={`nexg-brand ${dark ? 'nexg-brand-on-dark' : ''}`} aria-label={`NexG ${subtitle}`}>
    <svg className="nexg-brand-mark" viewBox="128 104 370 128" role="img" aria-label="NexG" preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id={whiteFilter} colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" /></filter>
        <clipPath id={colorClip} clipPathUnits="userSpaceOnUse">
          <rect x="228" y="104" width="84" height="138" />
          <polygon points="310,106 347,106 380,168 340,233 304,233 345,168" />
        </clipPath>
        <clipPath id={whiteClip} clipPathUnits="userSpaceOnUse">
          <path clipRule="evenodd" d="M128 104H498V232H128Z M228 104H312V232H228Z M310 106L347 106L380 168L340 233L304 233L345 168Z" />
        </clipPath>
      </defs>
      <image href={logo} width="612" height="408" filter={dark ? `url(#${whiteFilter})` : undefined} clipPath={dark ? `url(#${whiteClip})` : undefined} />
      {dark && <image href={logo} width="612" height="408" clipPath={`url(#${colorClip})`} />}
    </svg>
    {tools && <span className={`nexg-brand-tools ${subtitle === 'Petrolube' ? 'petrolube-italic' : ''}`}>{subtitle}</span>}
  </span>;
}

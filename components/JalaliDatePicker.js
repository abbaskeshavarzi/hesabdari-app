import { useEffect, useRef, useState } from 'react';
import {
  isoToJalali,
  jalaliToIso,
  todayJalali,
  jalaaliMonthLength,
  toGregorian,
  MONTH_NAMES,
  WEEKDAY_NAMES,
  toPersianDigits,
} from '../lib/jalaliCalendar';

// انتخابگر تاریخ شمسی — جایگزین <input type="date"> پیش‌فرض مرورگر
// value: تاریخ به فرمت ISO میلادی 'YYYY-MM-DD' (برای سازگاری با دیتابیس)
// onChange: تابعی که تاریخ جدید را به همان فرمت ISO برمی‌گرداند
export default function JalaliDatePicker({ value, onChange, className, placeholder, id, ...ariaProps }) {
  const [open, setOpen] = useState(false);
  const selected = isoToJalali(value);
  const t = todayJalali();
  const [viewYear, setViewYear] = useState((selected || t).jy);
  const [viewMonth, setViewMonth] = useState((selected || t).jm);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (selected) {
      setViewYear(selected.jy);
      setViewMonth(selected.jm);
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  function prevMonth() {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }
  function nextMonth() {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function pickDay(jd) {
    onChange(jalaliToIso(viewYear, viewMonth, jd));
    setOpen(false);
  }

  function pickToday() {
    onChange(jalaliToIso(t.jy, t.jm, t.jd));
    setViewYear(t.jy);
    setViewMonth(t.jm);
    setOpen(false);
  }

  // محاسبه اولین روز هفته ماه (شنبه = ۰)
  const firstOfMonthGreg = toGregorian(viewYear, viewMonth, 1);
  const firstWeekday = (new Date(firstOfMonthGreg.gy, firstOfMonthGreg.gm - 1, firstOfMonthGreg.gd).getDay() + 1) % 7;
  const daysInMonth = jalaaliMonthLength(viewYear, viewMonth);

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const label = selected
    ? toPersianDigits(selected.jy) + '/' + toPersianDigits(String(selected.jm).padStart(2, '0')) + '/' + toPersianDigits(String(selected.jd).padStart(2, '0'))
    : '';

  const years = [];
  for (let y = t.jy - 10; y <= t.jy + 2; y++) years.push(y);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={className || 'focus-ring w-full rounded-md border border-line px-3 py-2 text-sm text-right bg-surface'}
        {...ariaProps}
      >
        {label || <span className="text-ink/40">{placeholder || 'انتخاب تاریخ'}</span>}
      </button>

      {open && (
        <div className="absolute z-20 mt-1 bg-surface border border-line rounded-lg shadow-lg p-3 w-64" style={{ direction: 'rtl' }}>
          <div className="flex items-center justify-between mb-2 gap-1">
            <button type="button" onClick={prevMonth} className="focus-ring px-2 py-1 text-ink/60 hover:text-ink">›</button>
            <div className="flex items-center gap-1 text-xs">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="focus-ring rounded border border-line bg-surface px-1 py-1"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx} value={idx + 1}>{name}</option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="focus-ring rounded border border-line bg-surface px-1 py-1"
              >
                {years.map((y) => (
                  <option key={y} value={y}>{toPersianDigits(y)}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={nextMonth} className="focus-ring px-2 py-1 text-ink/60 hover:text-ink">‹</button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-ink/40 mb-1">
            {WEEKDAY_NAMES.map((w, idx) => (
              <div key={idx}>{w}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, idx) => {
              if (d === null) return <div key={idx} />;
              const isSelected = selected && selected.jy === viewYear && selected.jm === viewMonth && selected.jd === d;
              const isToday = t.jy === viewYear && t.jm === viewMonth && t.jd === d;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => pickDay(d)}
                  className={
                    'focus-ring text-xs rounded-md py-1.5 ' +
                    (isSelected
                      ? 'bg-brass text-white font-bold'
                      : isToday
                      ? 'border border-brass text-ink'
                      : 'text-ink hover:bg-paper')
                  }
                >
                  {toPersianDigits(d)}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={pickToday}
            className="focus-ring w-full mt-2 text-xs text-brass hover:underline text-center"
          >
            امروز
          </button>
        </div>
      )}
    </div>
  );
}

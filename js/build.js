// Which build this is.
//
// The source tree is the "universal" build: it keeps every platform's code and
// decides what to show at runtime. `build.py` overwrites this file when it
// produces the Windows and iOS distributions, so each of those knows what it is
// without having to guess from the user agent.

export const TARGET = 'universal';

export const IS_WINDOWS_BUILD = TARGET === 'windows';
export const IS_IOS_BUILD = TARGET === 'ios';
export const IS_UNIVERSAL_BUILD = TARGET === 'universal';

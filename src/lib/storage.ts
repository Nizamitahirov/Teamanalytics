// localStorage — yalnız istifadəçi rahatlığı üçün (dil, mövzu, menyu vəziyyəti). Əlçatmazdırsa səssizcə keçir.
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* gizli rejim və s. */
    }
  },
};

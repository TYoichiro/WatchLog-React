import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// globals を使わないので、Testing Library の自動クリーンアップは自分で登録する
afterEach(() => {
  cleanup();
});

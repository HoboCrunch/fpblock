"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Upload } from "lucide-react";

interface FileDropzoneProps {
  onFile: (file: File) => void;
  accept?: string;
}

export function FileDropzone({ onFile, accept = ".csv" }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={cn(
        "rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-200",
        "bg-[var(--glass-bg)] backdrop-blur-xl",
        isDragging
          ? "border-[var(--accent-orange)]/60 bg-[var(--accent-orange)]/5"
          : "border-[var(--glass-border)] hover:border-[var(--accent-orange)]/40 hover:bg-[var(--glass-bg-hover)]"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
      <Upload
        className={cn(
          "h-10 w-10 mx-auto mb-3 transition-colors",
          isDragging ? "text-[var(--accent-orange)]" : "text-[var(--text-muted)]"
        )}
      />
      <p className="text-white font-medium mb-1">
        Drop CSV here or click to browse
      </p>
      <p className="text-sm text-[var(--text-muted)]">
        Accepts .csv files
      </p>
    </div>
  );
}

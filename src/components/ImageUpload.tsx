import { useState, useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './ImageUpload.css';

interface ImageUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
}

export function ImageUpload({ images, onChange, maxImages = 10 }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const generateFilename = (originalName: string) => {
    const ext = originalName.split('.').pop() || 'png';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}.${ext}`;
  };

  const processFile = async (file: File): Promise<string | null> => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed');
      return null;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be less than 10MB');
      return null;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const filename = generateFilename(file.name);

      const savedPath = await invoke<string>('save_image', {
        filename,
        data: Array.from(uint8Array),
      });

      return savedPath;
    } catch (err) {
      console.error('Failed to save image:', err);
      setError('Failed to save image');
      return null;
    }
  };

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (images.length >= maxImages) {
      setError(`Maximum ${maxImages} images allowed`);
      return;
    }

    setError(null);
    setIsUploading(true);

    const fileArray = Array.from(files);
    const remainingSlots = maxImages - images.length;
    const filesToProcess = fileArray.slice(0, remainingSlots);

    const newPaths: string[] = [];

    for (const file of filesToProcess) {
      const path = await processFile(file);
      if (path) {
        newPaths.push(path);
      }
    }

    if (newPaths.length > 0) {
      onChange([...images, ...newPaths]);
    }

    setIsUploading(false);
  }, [images, maxImages, onChange]);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Only set dragging to false if we're leaving the drop zone entirely
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  }, [handleFiles]);

  // Clipboard paste handler
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // Check if we're in a text input - don't intercept paste there
      const activeElement = document.activeElement;
      if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        handleFiles(imageFiles);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handleFiles]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      // Reset input so same file can be selected again
      e.target.value = '';
    }
  };

  const handleRemoveImage = async (index: number) => {
    const imagePath = images[index];
    const filename = imagePath.split('/').pop();

    try {
      if (filename) {
        await invoke('delete_image', { filename });
      }
    } catch (err) {
      console.error('Failed to delete image file:', err);
      // Continue with removal from state even if file deletion fails
    }

    onChange(images.filter((_, i) => i !== index));
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="image-upload">
      {/* Drop zone */}
      <div
        ref={dropZoneRef}
        className={`image-upload-dropzone ${isDragging ? 'dragging' : ''} ${isUploading ? 'uploading' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleBrowseClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileInputChange}
          className="image-upload-input"
        />

        {isUploading ? (
          <div className="image-upload-content">
            <span className="image-upload-icon">...</span>
            <span className="image-upload-text">Uploading...</span>
          </div>
        ) : (
          <div className="image-upload-content">
            <span className="image-upload-icon">+</span>
            <span className="image-upload-text">
              {isDragging ? 'Drop images here' : 'Drag images here or click to browse'}
            </span>
            <span className="image-upload-hint">Cmd+V to paste from clipboard</span>
          </div>
        )}
      </div>

      {error && <p className="image-upload-error">{error}</p>}

      {/* Image previews */}
      {images.length > 0 && (
        <div className="image-upload-previews">
          {images.map((imagePath, index) => (
            <div key={index} className="image-preview-item">
              <img
                src={`asset://localhost/${imagePath}`}
                alt=""
                className="image-preview-thumb"
              />
              <button
                type="button"
                className="image-preview-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveImage(index);
                }}
                aria-label="Remove image"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <div className="image-upload-count">
          {images.length} / {maxImages} images
        </div>
      )}
    </div>
  );
}

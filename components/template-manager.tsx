"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/ui/use-toast";
import { invoke } from "@tauri-apps/api/core";
import {
  Upload,
  FileImage,
  ImagePlus,
  Trash2,
  Loader2,
  XCircle,
} from "lucide-react";

// 模板预览组件
interface TemplatePreviewProps {
  filename: string;
}

const TemplatePreview: React.FC<TemplatePreviewProps> = ({ filename }) => {
  const [imageSrc, setImageSrc] = useState<string>("");
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    const loadImage = async () => {
      try {
        const imageData = await invoke<string>('load_template_from_folder', { filename });
        setImageSrc(`data:image/png;base64,${imageData}`);
        setError(false);
      } catch (err) {
        console.error(`Failed to load template ${filename}:`, err);
        setError(true);
      }
    };

    loadImage();
  }, [filename]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <FileImage className="h-6 w-6 mx-auto text-gray-400" />
          <p className="text-xs text-gray-500 mt-1">加载失败</p>
        </div>
      </div>
    );
  }

  if (!imageSrc) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={filename}
      className="w-full h-full object-contain"
      onError={() => setError(true)}
    />
  );
};

// 模板管理组件Props
interface TemplateManagerProps {
  templateFiles: Array<{ name: string; data: string }>;
  onTemplateFilesChange: (templates: Array<{ name: string; data: string }>) => void;
  disabled?: boolean;
  roi?: [number, number, number, number] | null;
  videoRef?: React.RefObject<HTMLVideoElement>;
  triggerButton?: React.ReactNode;
  className?: string;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({
  templateFiles,
  onTemplateFilesChange,
  disabled = false,
  roi = null,
  videoRef = null,
  triggerButton,
  className = "",
}) => {
  const { toast } = useToast();

  // 模板管理相关状态
  const [showNamingDialog, setShowNamingDialog] = useState(false);
  const [capturedImageData, setCapturedImageData] = useState<string>("");
  const [templateName, setTemplateName] = useState("");
  const [isCapturingTemplate, setIsCapturingTemplate] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  // 模板选择对话框状态
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<string[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());

  // 选择模板图像
  const selectTemplateImages = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/png,image/jpeg,image/jpg,image/bmp';

    input.onchange = async (event) => {
      const files = (event.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        setIsLoadingTemplates(true);
        try {
          const newTemplates: { name: string; data: string }[] = [];

          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const reader = new FileReader();

            await new Promise<void>((resolve, reject) => {
              reader.onload = () => {
                if (reader.result) {
                  const base64Data = (reader.result as string).split(',')[1];
                  newTemplates.push({
                    name: file.name,
                    data: base64Data
                  });
                }
                resolve();
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
          }

          onTemplateFilesChange([...templateFiles, ...newTemplates]);
          toast({
            title: "模板选择成功",
            description: `已选择 ${newTemplates.length} 个模板文件`,
            variant: "default",
          });
        } catch (error) {
          toast({
            title: "处理文件失败",
            description: String(error),
            variant: "destructive",
          });
        } finally {
          setIsLoadingTemplates(false);
        }
      }
    };

    input.click();
  };

  // 删除模板
  const removeTemplate = (index: number) => {
    onTemplateFilesChange(templateFiles.filter((_, i) => i !== index));
  };

  // 清空所有模板
  const clearAllTemplates = () => {
    onTemplateFilesChange([]);
  };

  // 截取模板
  const captureTemplate = async () => {
    if (!videoRef?.current || videoRef.current.paused || videoRef.current.videoWidth === 0) {
      toast({
        title: "截图失败",
        description: "请确保视频正在播放",
        variant: "destructive",
      });
      return;
    }

    setIsCapturingTemplate(true);

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error("无法创建Canvas上下文");
      }

      const video = videoRef.current;

      // 根据是否有ROI来决定截取区域
      if (roi && roi[2] > 0 && roi[3] > 0) {
        // ROI坐标已经是视频原始坐标，直接使用
        const [videoX, videoY, videoW, videoH] = roi;

        // 验证ROI边界
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        const clampedX = Math.max(0, Math.min(videoX, videoWidth - 1));
        const clampedY = Math.max(0, Math.min(videoY, videoHeight - 1));
        const clampedWidth = Math.min(videoW, videoWidth - clampedX);
        const clampedHeight = Math.min(videoH, videoHeight - clampedY);

        // 调试信息
        console.log('ROI坐标使用:', {
          original: { x: videoX, y: videoY, w: videoW, h: videoH },
          videoSize: { width: video.videoWidth, height: video.videoHeight },
          clamped: { x: clampedX, y: clampedY, w: clampedWidth, h: clampedHeight }
        });

        if (clampedWidth > 0 && clampedHeight > 0) {
          canvas.width = clampedWidth;
          canvas.height = clampedHeight;

          // 只截取ROI区域
          ctx.drawImage(
            video,
            clampedX, clampedY, clampedWidth, clampedHeight,
            0, 0, clampedWidth, clampedHeight
          );
        } else {
          throw new Error("ROI区域无效");
        }
      } else {
        // 截取完整视频帧
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      // 转换为Blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("无法生成图像"));
          }
        }, 'image/png', 1.0);
      });

      // 转换为Base64
      const arrayBuffer = await blob.arrayBuffer();
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      // 暂存图片数据并显示命名弹窗
      setCapturedImageData(base64Data);
      setTemplateName(""); // 清空之前的名称
      setShowNamingDialog(true);

    } catch (error) {
      console.error("截取模板失败:", error);
      toast({
        title: "截取模板失败",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsCapturingTemplate(false);
    }
  };

  // 保存已命名的模板
  const saveTemplateWithName = async () => {
    if (!templateName.trim()) {
      toast({
        title: "保存失败",
        description: "请输入模板名称",
        variant: "destructive",
      });
      return;
    }

    if (!capturedImageData) {
      toast({
        title: "保存失败",
        description: "没有可保存的图片数据",
        variant: "destructive",
      });
      return;
    }

    try {
      // 确保文件名以.png结尾
      const filename = templateName.trim().endsWith('.png')
        ? templateName.trim()
        : `${templateName.trim()}.png`;

      // 保存文件到template_images文件夹
      await invoke('save_template_image', {
        filename,
        imageData: capturedImageData
      });

      // 添加到模板列表
      const newTemplate = {
        name: filename,
        data: capturedImageData
      };

      onTemplateFilesChange([...templateFiles, newTemplate]);

      toast({
        title: "模板保存成功",
        description: `已保存为 ${filename}`,
        variant: "default",
      });

      // 关闭弹窗并清理状态
      setShowNamingDialog(false);
      setCapturedImageData("");
      setTemplateName("");

    } catch (error) {
      console.error("保存模板失败:", error);
      toast({
        title: "保存模板失败",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  // 取消保存模板
  const cancelTemplateNaming = () => {
    setShowNamingDialog(false);
    setCapturedImageData("");
    setTemplateName("");
  };

  // 从templates文件夹选择模板
  const selectTemplatesFromFolder = async () => {
    try {
      setIsLoadingTemplates(true);
      const templateFiles = await invoke<string[]>('get_templates_from_folder');
      setAvailableTemplates(templateFiles);
      setShowTemplateSelector(true);
    } catch (error) {
      toast({
        title: "获取模板列表失败",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  // 关闭模板选择器
  const closeTemplateSelector = () => {
    setShowTemplateSelector(false);
    setSelectedTemplates(new Set());
  };

  // 切换模板选择状态
  const toggleTemplateSelection = (filename: string) => {
    const newSelected = new Set(selectedTemplates);
    if (newSelected.has(filename)) {
      newSelected.delete(filename);
    } else {
      newSelected.add(filename);
    }
    setSelectedTemplates(newSelected);
  };

  // 加载选中的多个模板
  const loadSelectedTemplates = async () => {
    if (selectedTemplates.size === 0) {
      toast({
        title: "未选择模板",
        description: "请至少选择一个模板文件",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoadingTemplates(true);
      const newTemplates: { name: string; data: string }[] = [];
      
      for (const filename of selectedTemplates) {
        const templateData = await invoke<string>('load_template_from_folder', { filename });
        newTemplates.push({ name: filename, data: templateData });
      }
      
      onTemplateFilesChange([...templateFiles, ...newTemplates]);
      
      toast({
        title: "模板加载成功",
        description: `已加载 ${newTemplates.length} 个模板文件`,
        variant: "default",
      });
      
      setShowTemplateSelector(false);
      setSelectedTemplates(new Set());
    } catch (error) {
      toast({
        title: "加载模板失败",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  // 删除单个模板文件
  const deleteTemplateFile = async (filename: string) => {
    try {
      await invoke('delete_template_from_folder', { filename });
      
      // 从可用模板列表中移除
      setAvailableTemplates(prev => prev.filter(name => name !== filename));
      
      // 从选中列表中移除
      const newSelected = new Set(selectedTemplates);
      newSelected.delete(filename);
      setSelectedTemplates(newSelected);
      
      toast({
        title: "删除成功",
        description: `已删除模板文件 ${filename}`,
        variant: "default",
      });
    } catch (error) {
      toast({
        title: "删除失败",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  // 批量删除选中的模板文件
  const deleteSelectedTemplates = async () => {
    if (selectedTemplates.size === 0) {
      toast({
        title: "未选择模板",
        description: "请至少选择一个模板文件进行删除",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoadingTemplates(true);
      
      for (const filename of selectedTemplates) {
        await invoke('delete_template_from_folder', { filename });
      }
      
      // 从可用模板列表中移除
      setAvailableTemplates(prev => prev.filter(name => !selectedTemplates.has(name)));
      
      toast({
        title: "批量删除成功",
        description: `已删除 ${selectedTemplates.size} 个模板文件`,
        variant: "default",
      });
      
      setSelectedTemplates(new Set());
    } catch (error) {
      toast({
        title: "批量删除失败",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  return (
    <div className={className}>
      <Popover>
        <PopoverTrigger asChild>
          {triggerButton || (
            <Button
              variant="outline"
              className="w-full justify-between"
              disabled={disabled}
            >
              <div className="flex items-center gap-2">
                <FileImage className="h-4 w-4" />
                <span>模板 ({templateFiles.length})</span>
              </div>
              <Badge variant="secondary" className="ml-2">
                {templateFiles.length > 0 ? "已配置" : "未配置"}
              </Badge>
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">模板管理</h4>
              <div className="flex gap-2">
                {templateFiles.length > 0 && (
                  <Button
                    onClick={clearAllTemplates}
                    disabled={disabled}
                    variant="outline"
                    size="sm"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    清空
                  </Button>
                )}
              </div>
            </div>

            <div className="text-xs text-gray-600 p-2 bg-blue-50 rounded-md">
              💡 您可以通过"上传模板"上传图片文件，点击"选择已保存"以画廊方式浏览templates文件夹中的模板（支持多选），或点击"截取画面"从当前视频帧截取模板。
              {roi && "当前有ROI区域，截图将只保存ROI区域内容。"}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={selectTemplateImages}
                disabled={isLoadingTemplates || disabled}
                variant="outline"
                size="sm"
              >
                {isLoadingTemplates ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}
                上传模板
              </Button>
              <Button
                onClick={selectTemplatesFromFolder}
                disabled={isLoadingTemplates || disabled}
                variant="outline"
                size="sm"
              >
                {isLoadingTemplates ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <FileImage className="h-4 w-4 mr-1" />
                )}
                选择已保存
              </Button>
              {videoRef && (
                <Button
                  onClick={captureTemplate}
                  disabled={isCapturingTemplate || !videoRef.current || disabled}
                  variant="outline"
                  size="sm"
                >
                  {isCapturingTemplate ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4 mr-1" />
                  )}
                  {roi ? "截取ROI" : "截取画面"}
                </Button>
              )}
            </div>

            {/* 模板列表 */}
            {templateFiles.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {templateFiles.map((template, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                    <div className="flex items-center gap-2 text-sm">
                      <FileImage className="h-4 w-4 text-blue-500" />
                      <span className="truncate" title={template.name}>
                        {template.name}
                      </span>
                    </div>
                    <Button
                      onClick={() => removeTemplate(index)}
                      disabled={disabled}
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 h-6 w-6 p-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <FileImage className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">尚未选择模板图像</p>
                <p className="text-xs text-gray-400">点击"上传"按钮添加模板</p>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* 模板命名对话框 */}
      <Dialog open={showNamingDialog} onOpenChange={setShowNamingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>为模板命名</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="templateName">模板名称</Label>
              <Input
                id="templateName"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="输入模板名称..."
                className="mt-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    saveTemplateWithName();
                  }
                }}
              />
            </div>
            {capturedImageData && (
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">预览图像:</p>
                <img
                  src={`data:image/png;base64,${capturedImageData}`}
                  alt="截取的模板"
                  className="max-w-full max-h-48 mx-auto border rounded"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelTemplateNaming}>
              取消
            </Button>
            <Button onClick={saveTemplateWithName} disabled={!templateName.trim()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 模板选择对话框 */}
      <Dialog open={showTemplateSelector} onOpenChange={setShowTemplateSelector}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle>选择模板</DialogTitle>
              <div className="flex items-center gap-2">
                {selectedTemplates.size > 0 && (
                  <>
                    <Badge variant="secondary" className="text-xs">
                      已选择 {selectedTemplates.size} 个
                    </Badge>
                    <Button
                      onClick={deleteSelectedTemplates}
                      disabled={isLoadingTemplates}
                      variant="destructive"
                      size="sm"
                    >
                      {isLoadingTemplates ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-1" />
                      )}
                      删除选中
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0">
            {availableTemplates.length > 0 ? (
              <div className="h-full overflow-y-auto pr-2">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2">
                  {availableTemplates.map((filename) => {
                    const isSelected = selectedTemplates.has(filename);
                    return (
                      <div
                        key={filename}
                        className={`group relative border rounded-md overflow-hidden hover:shadow-md transition-all cursor-pointer bg-white ${
                          isSelected ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-gray-300'
                        }`}
                        onClick={() => toggleTemplateSelection(filename)}
                      >
                        <div className="aspect-square bg-gray-50 flex items-center justify-center relative">
                          <TemplatePreview filename={filename} />

                          {/* 悬停效果 */}
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 flex items-center justify-center">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              {/* 选择状态指示 */}
                            </div>
                          </div>

                          {/* 删除按钮 */}
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTemplateFile(filename);
                            }}
                            variant="destructive"
                            size="sm"
                            className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="p-1 bg-white border-t">
                          <p className="text-xs text-gray-700 truncate text-center" title={filename}>
                            {filename}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 text-gray-500">
                <div className="text-center">
                  <FileImage className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">templates文件夹中没有找到模板文件</p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-shrink-0 pt-3 border-t">
            <div className="flex items-center justify-between w-full">
              <div className="text-xs text-gray-500">
                {selectedTemplates.size > 0
                  ? `已选择 ${selectedTemplates.size} 个模板`
                  : "点击模板卡片选择模板"
                }
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={closeTemplateSelector}>
                  取消
                </Button>
                <Button
                  onClick={loadSelectedTemplates}
                  disabled={selectedTemplates.size === 0}
                >
                  加载选中 ({selectedTemplates.size})
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}; 
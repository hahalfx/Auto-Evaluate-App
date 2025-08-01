import * as XLSX from "xlsx";
import type { Task, TestSample, WakeWord, AnalysisResult } from "@/types/api";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

interface ExportData {
  task: Task;
  samples: TestSample[];
  wakeWords: WakeWord[];
}

/**
 * 导出任务报告为 Excel 文件
 * @param data 包含任务、样例和唤醒词的数据
 * @param onSuccess 导出成功回调
 * @param onError 导出失败回调
 */
export async function exportTaskReport(
  data: ExportData,
  onSuccess?: (fileName: string) => void,
  onError?: (error: Error) => void
) {
  try {
    const { task, samples, wakeWords } = data;

    // 验证数据完整性
    if (!task.test_result || Object.keys(task.test_result).length === 0) {
      throw new Error("任务没有测试结果数据");
    }

    // 准备基础信息
    const reportData = {
      taskName: task.name,
      date: task.created_at,
      audioType: task.audioType || "",
      audioFile: task.wake_word_ids.length > 0 
        ? wakeWords.find(w => w.id === task.wake_word_ids[0])?.text || "" 
        : "",
      audioDuration: task.audioDuration || "",
      audioCategory: task.audioCategory || "",
      testCollection: task.testCollection || "",
      testDuration: task.testDuration || "",
      sentenceAccuracy: task.sentenceAccuracy || null,
      wordAccuracy: task.wordAccuracy || null,
      characterErrorRate: task.characterErrorRate || null,
      recognitionSuccessRate: task.recognitionSuccessRate || null,
      totalWords: task.totalWords || null,
      insertionErrors: task.insertionErrors || null,
      deletionErrors: task.deletionErrors || null,
      substitutionErrors: task.substitutionErrors || null,
      fastestRecognitionTime: task.fastestRecognitionTime || null,
      slowestRecognitionTime: task.slowestRecognitionTime || null,
      averageRecognitionTime: task.averageRecognitionTime || null,
      completedSamples: Object.keys(task.test_result).length,
      items: Object.entries(task.test_result).map(([id, item]) => {
        const sample = samples.find(s => s.id === Number(id));
        return {
          audioFile: task.wake_word_ids.length > 0 
            ? wakeWords.find(w => w.id === task.wake_word_ids[0])?.text || "" 
            : "",
          recognitionFile: item.recognitionFile || "",
          device: item.device || "科大讯飞ASRAPI",
          recognitionResult: item.recognitionResult || "成功",
          insertionErrors: item.insertionErrors !== undefined ? item.insertionErrors : null,
          deletionErrors: item.deletionErrors !== undefined ? item.deletionErrors : null,
          substitutionErrors: item.substitutionErrors !== undefined ? item.substitutionErrors : null,
          totalWords: item.totalWords || null,
          referenceText: sample?.text || "",
          recognizedText: item.recognizedText || "",
          resultStatus: item.resultStatus || "",
          recognitionTime: item.recognitionTime || null,
          machineResponse: task.machine_response?.[Number(id)]?.text || "",
          responseTime: item.responseTime || null,
          LLMAnalysisResult: item.assessment ? String(item.assessment.valid) : "",
          totalScore: item.assessment?.overall_score || null,
          semantic_correctness: item.assessment?.semantic_correctness?.score || null,
          state_change_confirmation: item.assessment?.state_change_confirmation?.score || null,
          unambiguous_expression: item.assessment?.unambiguous_expression?.score || null,
          testTime: item.test_time || "",
        };
      }),
    };

    // 生成 Excel 文件
    const fileName = `${task.name}_测试报告_${new Date().toISOString().slice(0, 10)}.xlsx`;
    await generateExcelFile(reportData, fileName);
    
    onSuccess?.(fileName);
  } catch (error) {
    console.error("导出失败:", error);
    onError?.(error instanceof Error ? error : new Error("导出过程中发生未知错误"));
  }
}

/**
 * 生成 Excel 文件
 */
async function generateExcelFile(data: any, fileName: string) {
  return new Promise<void>(async (resolve, reject) => {
    try {
      const wb = XLSX.utils.book_new();

      // 创建任务信息工作表
      const taskInfo = [
        ["任务信息"],
        ["任务名称", data.taskName],
        ["创建日期", data.date],
        ["音频类型", data.audioType],
        ["唤醒词", data.audioFile],
        ["音频时长", data.audioDuration],
        ["音频类别", data.audioCategory],
        ["测试集合", data.testCollection],
        ["测试时长", data.testDuration],
        [""],
        ["统计信息"],
        ["句正确率", data.sentenceAccuracy ? data.sentenceAccuracy.toFixed(4) : ""],
        ["字正确率", data.wordAccuracy ? data.wordAccuracy.toFixed(4) : ""],
        ["字错误率", data.characterErrorRate ? data.characterErrorRate.toFixed(3) : ""],
        ["唤醒成功率", data.recognitionSuccessRate || ""],
        ["总字数", data.totalWords || ""],
        ["插入错误", data.insertionErrors || ""],
        ["删除错误", data.deletionErrors || ""],
        ["替换错误", data.substitutionErrors || ""],
        ["平均识别时间(ms)", data.averageRecognitionTime || ""],
        ["最快识别时间(ms)", data.fastestRecognitionTime || ""],
        ["最慢识别时间(ms)", data.slowestRecognitionTime || ""],
        ["完成样例数", data.completedSamples || ""],
      ];

      const taskWs = XLSX.utils.aoa_to_sheet(taskInfo);
      XLSX.utils.book_append_sheet(wb, taskWs, "任务信息");

      // 创建详细结果工作表
      if (data.items && data.items.length > 0) {
        const headers = [
          "序号",
          "唤醒词",
          "参考文本",
          "识别文本",
          "识别结果",
          "识别时间(ms)",
          "插入错误",
          "删除错误",
          "替换错误",
          "总字数",
          "机器响应",
          "响应时间(ms)",
          "LLM评估",
          "总分",
          "语义正确性",
          "状态确认",
          "表达明确性",
          "测试时间",
        ];

        const rows = data.items.map((item: any, index: number) => [
          index + 1,
          item.audioFile,
          item.referenceText,
          item.recognizedText,
          item.recognitionResult,
          item.recognitionTime,
          item.insertionErrors,
          item.deletionErrors,
          item.substitutionErrors,
          item.totalWords,
          item.machineResponse,
          item.responseTime,
          item.LLMAnalysisResult,
          item.totalScore,
          item.semantic_correctness,
          item.state_change_confirmation,
          item.unambiguous_expression,
          item.testTime,
        ]);

        const detailWs = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        XLSX.utils.book_append_sheet(wb, detailWs, "详细结果");
      }

      // 将 Excel 文件转换为二进制数据
      const excelData = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
      
      // 转换为 Uint8Array
      const buffer = new Uint8Array(excelData.length);
      for (let i = 0; i < excelData.length; i++) {
        buffer[i] = excelData.charCodeAt(i) & 0xFF;
      }
      
      // 弹出保存对话框
      const filePath = await save({
        defaultPath: fileName,
        filters: [
          {
            name: 'Excel 文件',
            extensions: ['xlsx']
          }
        ]
      });
      
      if (!filePath) {
        reject(new Error('用户取消了保存操作'));
        return;
      }
      
      // 保存文件
      await writeFile(filePath, buffer);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 导出为 CSV 格式（可选）
 */
export function exportTaskReportCSV(data: ExportData): string {
  const { task, samples, wakeWords } = data;
  
  if (!task.test_result) {
    throw new Error("任务没有测试结果数据");
  }

  const headers = [
    "序号",
    "唤醒词",
    "参考文本",
    "识别文本",
    "识别结果",
    "识别时间(ms)",
    "机器响应",
    "LLM评估",
    "总分",
    "测试时间",
  ];

  const rows = Object.entries(task.test_result).map(([id, item]) => {
    const sample = samples.find(s => s.id === Number(id));
    return [
      id,
      task.wake_word_ids.length > 0 ? wakeWords.find(w => w.id === task.wake_word_ids[0])?.text || "" : "",
      sample?.text || "",
      item.recognizedText || "",
      item.recognitionResult || "",
      item.recognitionTime || "",
      task.machine_response?.[Number(id)]?.text || "",
      item.assessment ? String(item.assessment.valid) : "",
      item.assessment?.overall_score || "",
      item.test_time || "",
    ];
  });

  return [headers, ...rows].map(row => row.join(",")).join("\n");
}
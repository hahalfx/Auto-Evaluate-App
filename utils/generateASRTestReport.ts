import * as XLSX from "xlsx";

interface ASRTestItem {
  audioFile: string;
  recognitionFile: string;
  device: string;
  recognitionResult: string;
  referenceText: string;
  recognizedText: string;
  resultStatus: string;
  recognitionTime: number | null;
  machineResponse: string;
  responseTime: number | null;
  LLMAnalysisResult: string;
  totalScore: number | null;
  semantic_correctness: number | null;
  state_change_confirmation: number | null;
  unambiguous_expression: number | null;
  testTime: string;
  // 新增字段
  wakeResult: string;
  wakeJudgmentBasis: string;
  slidingDetailedResult: string;
}

export interface ASRTestReport {
  taskName: string;
  date: string;
  audioType: string;
  audioFile: string;
  audioDuration: string;
  audioCategory: string;
  testCollection: string;
  testDuration: string;
  sentenceAccuracy: number | null;
  wordAccuracy: number | null;
  characterErrorRate: number | null;
  recognitionSuccessRate: number | null;
  fastestRecognitionTime: number | null;
  slowestRecognitionTime: number | null;
  averageRecognitionTime: number | null;
  completedSamples: number | null;
  items: ASRTestItem[];
}

/**
 * Generate an Excel file based on ASR test report data
 * @param reportData The ASR test report data
 * @param fileName The name of the exported file
 */
export function generateASRTestReport(
  reportData: ASRTestReport,
  fileName: string = reportData.taskName+"测试报告.xlsx"
): void {
  // Create a new workbook
  const wb = XLSX.utils.book_new();

  // Format the header data for the report
  const headerData = [
    ["车机语音大模型测试报告"],
    [
      "任务详情",
      "任务名称",
      reportData.taskName,
      "",
      "",
      "日期信息",
      reportData.date,
      "",
      "",
      "噪音级别",
      "",
    ],
    [
      "",
      "噪音类型",
      reportData.audioType,
      "",
      "",
      "噪音基信息",
      "",
      "",
      "",
      "验证集信息",
      reportData.testCollection,
    ],
    [
      "",
      "噪醒集信息",
      reportData.audioFile,
      "",
      "",
      "噪音总时长",
      reportData.audioDuration,
      "",
      "",
      "测试耗时",
      reportData.testDuration,
    ],
    [
      "",
      "句正确率",
      reportData.sentenceAccuracy ? reportData.sentenceAccuracy.toFixed(4) : "",
      "",
      "",
      "字正确率",
      reportData.wordAccuracy ? reportData.wordAccuracy.toFixed(4) : "",
      "",
      "",
      "字错误率",
      reportData.characterErrorRate ? reportData.characterErrorRate.toFixed(3) : "",
    ],
    [
      "",
      "唤醒成功率",
      reportData.recognitionSuccessRate,
      "",
      "",
      "平均识别时间(ms)",
      reportData.averageRecognitionTime,
      "",
      "",
      "最快识别时间(ms)",
      reportData.fastestRecognitionTime,
    ],
    [
      "",
      "最慢识别时间(ms)",
      reportData.slowestRecognitionTime,
      "",
      "",
      "已执行用例数",
      reportData.completedSamples,
      "",
      "",
      "",
      "",
    ],
    ["测试记录"],
    [
      "唤醒音频",
      "识别音频",
      "识别设备",
      "唤醒结果",
      "标注文本",
      "识别文本",
      "识别结果",
      "识别时间(ms)",
      "车机响应",
      "车机响应间隔时长",
      "大模型测试结果",
      "总分",
      "语义正确性",
      "状态变更确认",
      "表达无歧义",
      "测试时间",
      "唤醒结果",
      "唤醒判断依据",
      "滑行详细结果",
    ],
  ];

  // Add test items to the data array
  const itemsData = reportData.items.map((item) => [
    item.audioFile,
    item.recognitionFile,
    item.device,
    item.recognitionResult,
    item.referenceText,
    item.recognizedText,
    item.resultStatus,
    item.recognitionTime,
    item.machineResponse,
    item.responseTime,
    item.LLMAnalysisResult,
    item.totalScore,
    item.semantic_correctness,
    item.state_change_confirmation,
    item.unambiguous_expression,
    item.testTime,
    item.wakeResult,
    item.wakeJudgmentBasis,
    item.slidingDetailedResult,
  ]);

  // Combine header and items data
  const allData = [...headerData, ...itemsData];

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(allData);

  // Set column widths
  const colWidths = [
    { wch: 15 }, // 唤醒音频
    { wch: 12 }, // 识别音频
    { wch: 12 }, // 识别设备
    { wch: 10 }, // 唤醒结果
    { wch: 20 }, // 标注文本
    { wch: 20 }, // 识别文本
    { wch: 10 }, // 识别结果
    { wch: 15 }, // 识别时间(ms)
    { wch: 20 }, // 车机响应
    { wch: 15 }, // 车机响应间隔时长
    { wch: 15 }, // 大模型测试结果
    { wch: 10 }, // 总分
    { wch: 12 }, // 语义正确性
    { wch: 15 }, // 状态变更确认
    { wch: 12 }, // 表达无歧义
    { wch: 15 }, // 测试时间
    { wch: 10 }, // 唤醒结果
    { wch: 12 }, // 唤醒判断依据
    { wch: 30 }, // 滑行详细结果
  ];
  ws['!cols'] = colWidths;

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, "测试报告");

  // Write to file
  XLSX.writeFile(wb, fileName);
}

/**
 * Example usage of the function
 */
export function example() {
  // Sample test report data
  const sampleReport: ASRTestReport = {
    taskName: "L1-1-S32-识别-东北男",
    date: "2025-02-25",
    audioType: "噪音",
    audioFile: "你好纳米.wav",
    audioDuration: "30s",
    audioCategory: "车机噪音",
    testCollection: "验证集",
    testDuration: "5分钟",
    sentenceAccuracy: 0.85,
    wordAccuracy: 0.92,
    characterErrorRate: 0.08,
    recognitionSuccessRate: 0.95,
    fastestRecognitionTime: 1200,
    slowestRecognitionTime: 2000,
    averageRecognitionTime: 1711,
    completedSamples: 999,
    items: [
      {
        audioFile: "你好纳米.wav",
        recognitionFile: "B0001.wav",
        device: "USB设备",
        recognitionResult: "Success",
        referenceText: "我在哪",
        recognizedText: "我在哪儿",
        resultStatus: "Fail",
        recognitionTime: 1365,
        machineResponse: "",
        responseTime: null,
        LLMAnalysisResult: "",
        totalScore: null,
        semantic_correctness: null,
        state_change_confirmation: null,
        unambiguous_expression: null,
        testTime: "25-02-25 09:17:37",
        wakeResult: "成功",
        wakeJudgmentBasis: "语音识别",
        slidingDetailedResult: "语音识别结果：我在哪儿",
      },
      {
        audioFile: "你好纳米.wav",
        recognitionFile: "B0003.wav",
        device: "USB设备",
        recognitionResult: "Success",
        referenceText: "定位当前位置",
        recognizedText: "定位当前位置",
        resultStatus: "Success",
        recognitionTime: 1376,
        machineResponse: "",
        responseTime: null,
        LLMAnalysisResult: "",
        totalScore: null,
        semantic_correctness: null,
        state_change_confirmation: null,
        unambiguous_expression: null,
        testTime: "25-02-25 09:17:44",
        wakeResult: "成功",
        wakeJudgmentBasis: "语音识别",
        slidingDetailedResult: "语音识别结果：定位当前位置",
      },
    ],
  };

  // Generate the Excel file
  generateASRTestReport(sampleReport);
}

// Call the example function if you want to test it
// example();

// Export the function for use in other modules
export default generateASRTestReport;

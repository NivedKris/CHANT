import { runOrchestrator } from './api/orchestrator.js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY || "";

const verses = [
  {
    meter: "Anuṣṭubh",
    text: "धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः। मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय"
  },
  {
    meter: "Anuṣṭubh",
    text: "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन। मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि"
  },
  {
    meter: "Anuṣṭubh",
    text: "यदा यदा हि धर्मस्य ग्लानिर्भवति भारत। अभ्युत्थानमधर्मस्य तदात्मानं सृजाम्यहम्"
  },
  {
    meter: "Anuṣṭubh",
    text: "नैमिषेऽनिमिषक्षेत्रे ऋषयः शौनकादयः। सत्रं स्वर्गाय लोकाय सहस्रसममासत"
  },
  {
    meter: "Vasantatilakā",
    text: "नारायणाय परिपूर्णगुणार्णवाय विश्वोदयस्थितिलयोन्नियतिप्रदाय। ज्ञानप्रदाय विबुधासुरसौख्यदुःखसत्कारणाय वितताय नमोनमस्ते"
  },
  {
    meter: "Vasantatilakā",
    text: "अङ्गं हरेः पुलकभूषणमाश्रयन्ती भृङ्गाङ्गनेव मुकुलाभरणं तमालम्। अङ्गीकृताखिलविभूतिरपाङ्गलीला माङ्गल्यदास्तु मम मङ्गलदेवतायाः"
  },
  {
    meter: "Vasantatilakā",
    text: "मुग्धा मुहुर्विदधती वदने मुरारेः प्रेमत्रपाप्रणिहितानि गतागतानि। माला दृशोर्मधुकरीव महोत्पले या सा मे श्रियं दिशतु सागरसंभवायाः"
  },
  {
    meter: "Vasantatilakā",
    text: "आहुश्च ते नलिननाभ पदारविन्दं योगेश्वरैर्हृदि विचिन्त्यमगाधबोधैः। संसारकूपपतितोत्तरणावलम्बं गेहजुषामपि मनस्युदियात्सदा नः"
  },
  {
    meter: "Śārdūlavikrīḍita",
    text: "जन्माद्यस्य यतोऽन्वयादितरतश्चार्थेष्वभिज्ञः स्वराट् तेने ब्रह्म हृदा य आदिकवये मुह्यन्ति यत्सूरयः। तेजोवारिमृदां यथा विनिमयो यत्र त्रिसर्गोऽमृषा धाम्ना स्वेन सदा निरस्तकुहकं सत्यं परं धीमहि"
  },
  {
    meter: "Śārdūlavikrīḍita",
    text: "यं ब्रह्मा वरुणेन्द्ररुद्रमरुतः स्तुन्वन्ति दिव्यैः स्तवैर्वेदैः साङ्गपदक्रमोपनिषदैर्गायन्ति यं सामगाः। ध्यानावस्थिततद्गतेन मनसा पश्यन्ति यं योगिनो यस्यान्तं न विदुः सुरासुरगणा देवाय तस्मै नमः"
  },
  {
    meter: "Śārdūlavikrīḍita",
    text: "कस्तूरीतिलकं ललाटफलके वक्षःस्थले कौस्तुभं नासाग्रे नवमौक्तिकं करतले वेणुं करे कङ्कणम्। सर्वाङ्गे हरिचन्दनं सुललितं कण्ठे च मुक्तावली गोपस्त्रीपरिवेष्टितो विजयते गोपालचूडामणिः"
  },
  {
    meter: "Mālinī",
    text: "भगवति तव तीरे नीरमात्राशनोऽहं विगतविषयतृष्णः कृष्णमाराधयामि। सकलकलुषभङ्गे स्वर्गसोपानसङ्गे तरलतरतरङ्गे देवि गङ्गे प्रसीद"
  },
  {
    meter: "Mālinī",
    text: "हठलुठ दल घिष्टोत्कण्ठदष्ठष्विघुत् सटशठ कठिनोः पीठभित्सुष्ठनिष्ठाम्। पठतिनुतव कण्ठाधिष्ठ घोरान्त्रमाला दह दह नरसिंहासह्यवीर्याहितं मे"
  },
  {
    meter: "Drutavilambita",
    text: "निगमकल्पतरोर्गलितं फलं शुकमुखादमृतद्रवसंयुतम्。 पिबत भागवतं रसमालयं मुहुरहो रसिका भुवि भावुकाः"
  },
  {
    meter: "Vaṃśastha",
    text: "पश्यन्त्यदो रूपमदभ्रचक्षुषः सहस्रपादोरुभुजाननाद्भुतम्। सहस्रमूर्ध्नश्रवणाक्षिनासिकं सहस्रमौल्यम्बरकुण्डलोल्लसत्"
  }
];

async function generateLogs() {
  console.log("Generating full prosody analysis logs for all test verses...");
  const logs = [];

  for (const v of verses) {
    console.log(`Processing verse: ${v.text.slice(0, 30)}...`);
    try {
      const state = await runOrchestrator(API_KEY, v.text);
      logs.push({
        expected_meter: v.meter,
        annotation: state.annotation,
        stylePrompt: state.stylePrompt,
        disambiguationLog: state.disambiguationLog
      });
    } catch (err) {
      console.error(`Error processing verse:`, err);
    }
  }

  const outputFilePath = "./prosody_analysis_logs.json";
  fs.writeFileSync(outputFilePath, JSON.stringify(logs, null, 2), "utf-8");
  console.log(`All logs successfully saved to ${outputFilePath}`);
}

generateLogs();

const fs = require('fs');
const path = require('path');

let questionScheduler = null;

function getQuestionForDay() {
  try {
    const questionsPath = path.join(__dirname, '../json/dailyQuestion.json');
    const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
    
    // Get current day of month (1-30, cycling)
    const today = new Date();
    const dayOfMonth = today.getDate();
    
    // Find question for this day
    const questionObj = questions.find(q => q.Day === dayOfMonth);
    
    if (!questionObj) {
      console.log(`⚠️  No question found for Day ${dayOfMonth}`);
      return null;
    }
    
    return questionObj;
  } catch (error) {
    console.error('Error reading daily questions:', error);
    return null;
  }
}

function createQuestionEmbed(question) {
  const { EmbedBuilder } = require('discord.js');
  
  const embed = new EmbedBuilder()
    .setColor('#FF6B9D')
    .setTitle(`📝 Day ${question.Day}: ${question.Question}`)
    .addFields(
      { name: '📥 Input', value: `\`\`\`${question.Input}\`\`\``, inline: false },
      { name: '📤 Output', value: `\`\`\`${question.Output}\`\`\``, inline: false },
      { name: '💡 Explanation', value: question.Explain, inline: false }
    )
    .setFooter({ text: 'Daily Coding Challenge' })
    .setTimestamp();
  
  if (question.Formula) {
    embed.addFields({ name: '🔢 Formula', value: `\`${question.Formula}\``, inline: false });
  }
  
  return embed;
}

async function postDailyQuestion(client) {
  try {
    const question = getQuestionForDay();
    if (!question) return;
    
    const embed = createQuestionEmbed(question);
    
    // Post to all guilds in the vibe-code channel
    for (const guild of client.guilds.cache.values()) {
      const channel = guild.channels.cache.find(ch => 
        ch.name.toLowerCase().includes('vibe') && 
        ch.name.toLowerCase().includes('code') &&
        ch.isTextBased()
      );
      
      if (channel) {
        try {
          await channel.send({
            content: '<@&1304899208819671100> Daily Coding Challenge! 🚀', // @Belmonts role
            embeds: [embed]
          });
          console.log(`✓ Posted daily question to ${guild.name}`);
        } catch (error) {
          console.error(`Error posting to ${guild.name}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.error('Error in postDailyQuestion:', error);
  }
}

function scheduleQuestionPost(client) {
  const now = new Date();
  const targetHour = 8; // 8:00 AM
  const targetMinute = 0;
  
  // Calculate next 8:00 AM
  let nextRun = new Date();
  nextRun.setHours(targetHour, targetMinute, 0, 0);
  
  // If 8:00 AM has already passed today, schedule for tomorrow
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  const timeUntilRun = nextRun - now;
  
  // Clear existing scheduler
  if (questionScheduler) {
    clearTimeout(questionScheduler);
  }
  
  // Schedule the question post
  questionScheduler = setTimeout(() => {
    postDailyQuestion(client);
    // Reschedule for the next day
    scheduleQuestionPost(client);
  }, timeUntilRun);
  
  const hoursLeft = Math.floor(timeUntilRun / (1000 * 60 * 60));
  const minutesLeft = Math.floor((timeUntilRun % (1000 * 60 * 60)) / (1000 * 60));
  
  console.log(`📅 Daily question scheduler initialized (Next: ${hoursLeft}h ${minutesLeft}m at 8:00 AM)`);
}

module.exports = {
  setupDailyQuestion: (client) => {
    scheduleQuestionPost(client);
  }
};

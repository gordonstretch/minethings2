<? echo $javascript->link('timestamp'); ?>

<div id="fullcenter">

<div style="float:right">

<?
$chatHeight = 500;
$padding = 5;
$totalHeight = $chatHeight + 2 * $padding;
?>
<script type="text/javascript">
lastChatId = 0;
timestamp = 0;
chatIgnores = <? echo '["'.join('","', $chatIgnores).'"]'; ?>;
currentTime = <?echo time();?>;
timeOffset = currentTime - new Date().getTime()/1000;
</script>

<div id ="ChatsDiv" style="margin-top:30px; border-left:1px solid;border-top:1px solid;padding:<?echo $padding;?>px;width:400px;height:<?echo $chatHeight;?>px;overflow-x:hidden; word-wrap:break-word">
</div>

<p>Last message sent
<script type="text/javascript">
PrintTimestamp("timestamp");
</script>.
</p>

<?
echo '<script type="text/javascript">'."\n";
echo "//<![CDATA[\n";
echo '
var pex = new PeriodicalExecuter(function(pe) { 
	new Ajax.Request("/php/getChats.php?lastChatId="+lastChatId, {
		asynchronous:true, evalScripts:true, onComplete:function(request, json) {
			data = request.responseText.evalJSON();
			if (lastChatId != data.lastChatId)	
				for (var i = 0; i < data.chats.length; i++) {		
					chat = data.chats[i];		
					if (lastChatId == 0 || chat.minerId != '.$minerId.') { 			
						if (chatIgnores.indexOf(chat.minerName) == -1)	
							$("ChatsDiv").insert(chat.text);			
						else				
							$("ChatsDiv").insert("<div style=\"display:inline;font-size:6px;\">[ignored] </div>");		
					}	
				}
				if (data.timestamp != undefined)	
					timestamp = data.timestamp;
				lastChatId = data.lastChatId;
				UpdateTimestamp("timestamp");
				if (atBottom) 	
					new Effect.Tween("ChatsDiv", $("ChatsDiv").scrollTop, $("ChatsDiv").scrollHeight, {duration: 1.0}, "scrollTop");
			}
		}); 					
	atBottom = (lastChatId == 0 || $("ChatsDiv").scrollTop >= ($("ChatsDiv").scrollHeight - '.$totalHeight.'));}, 3)
'."\n";
echo 'pex.execute();'."\n";
echo "//]]>\n";
echo '</script>';
?>

<div style="margin-top:5px">
<?
echo $ajax->form(array(
	'id' => 'SendForm',
	'type' => 'post',
	'options' => array(
		'model' => 'Chat',
		'url' => array('controller' => 'chats', 'action' => 'add_chat'),
		'indicator' => 'SendingDiv',
		'after' => '$("ChatText").clear();',
		'complete' => 'new Effect.Tween("ChatsDiv", $("ChatsDiv").scrollTop, $("ChatsDiv").scrollHeight, {duration: 1.0}, "scrollTop");',
		'update' => 'ChatsDiv',
		'position' => 'Bottom',
		),
	));

echo $form->input('Chat.text', array('id' => 'ChatText', 'type' => 'textarea', 'rows' => '1', 'label' => false, 'style' => 'width:400px',
'onkeypress' => 'if (this.value.length >= 500) this.value = this.value.substring(0, 500); if(window.event) key = window.event.keyCode; else key = event.which; if (key == 13) { $("SendButton").click(); return false; }',
));

if ($miner['Miner']['meld_count'] >= 140)
{
	echo '<div style="float:right">';
	echo '<input type="color" label="color" name="data[Chat][color]" value="#'.$miner['Profile']['chat_color'].'" />';
	//echo $form->input('Chat.color', array('size' => 6, 'label' => 'color (hex) ', 'value' => $miner['Profile']['chat_color']));
	echo '</div>';
}


echo $form->end(array('id' => 'SendButton', 'div' => array('style' => 'display:none')));
?>
</div>
<div id="SendingDiv" style="position:absolute;display:none">sending...</div>


<div style="margin-top:20px">
	<?
	echo $form->create(NULL, array('action' => 'list_miners'));
	echo $form->input('ChatIgnore.name', array(
		'label' => '',
		'div' => false,
		'onmouseout' => 'this.value = this.value.substring(this.value.lastIndexOf("/")+1);')); // allow profile link drop&drag
	echo $form->end(array('label' => 'Ignore', 'div' => false));
	?>
</div>

<div id="IgnoredDiv" style="display:inline">
<? echo $ajax->link('Show Ignored', 
	array('action' => 'js_show_ignored'),
	array('update' => 'IgnoredDiv')); ?>
</div>
<div style="height:25px"> </div>

</div>


<h2 id="list-miners">Registered Miners</h2>
<? if (count($miners) == 0): ?>
	<p>No miners</p>
<? endif ?>

<? // table headers ?>
<span style="display:inline-block; width:180px">
	<? echo $ajax->form('js_list_miners', 'post', array(
		'indicator' => 'LoadingDiv',
		'update' => 'MinersListDiv',
		));
	echo $form->text('Miner.name', array('label' => false, 'type' => 'textbox', 'size' => 20));
	echo $form->end(); ?>
</span> 
<span style="display:inline-block; width:110px">
	<? echo $ajax->form('js_list_miners', 'post', array(
		'indicator' => 'LoadingDiv',
		'update' => 'MinersListDiv',
		));
	$options = array(-1 => 'Profession');
	foreach($professionOptions as $v => $n) $options[$v] = $n;
	echo $form->input('Miner.profession', array(
		'label' => false, 
		'onchange' => '$("ProfessionSubmit").click();',
		'options' => $options));
	echo $form->end(array('id' => 'ProfessionSubmit', 'style' => 'display:none')); ?>	
</span> 
<span style="display:inline-block; width:80px">
	<?
	echo $ajax->form('js_list_miners', 'post', array(
		'indicator' => 'LoadingDiv',
		'update' => 'MinersListDiv',
		));
	$options = array(-1 => 'Home');
	foreach($cityOptions as $v => $n) $options[$v] = $n;
	echo $form->input('Miner.city', array(
		'label' => false,
		'onchange' => '$("CitySubmit").click();',
		'options' => $options));
	echo $form->end(array('id' => 'CitySubmit', 'style' => 'display:none')); ?>	
</span>


<div id="MinersListDiv">
<? include 'miners.inc'; ?>
</div>
      
</div>

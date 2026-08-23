<?
foreach($chats as $c)
	echo '<div>'
		.$html->link($c['miner_name'], '/miners/profile/'.$c['miner_name'])
		.': '.$c['text']
		.'</div>';
?>

<script type="text/javascript">
lastChatId = <? echo $lastChatId; ?>;
<? if (isset($timestamp)): ?>
timestamp = <?echo $timestamp;?>;
<? endif; ?>
UpdateTimestamp("timestamp");
</script>


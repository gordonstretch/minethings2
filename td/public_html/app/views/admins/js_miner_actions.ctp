<? echo $ajax->div('ActionsDiv'); ?>

<style>td p.hidden { display:none; }</style>

<span style="font-size:12px">
<table class="actiontable">
<? echo $html->tableHeaders(array('Action', 'Params', 'Created')); 

foreach($actions as $a) {
	$params = '';
	if (count($a['ActionParameter']))
	{
		$ap = $a['ActionParameter'][0];
		if (strlen($ap['args']) or strlen($ap['post']))
		{
			if (!strlen($ap['args']))
				$ap['args'] = 'load post';
				
			if (strlen($ap['post']))
				$params = "<a href='#'>".$ap['args']."</a><p class='hidden'>".$ap['post'].'</p>';
			else
				$params = $ap['args'];
		}
	}
	echo $html->tableCells(array(
		'<a href="#">'.$a['ActionLog']['action'].'</a><p class="hidden">'.$a['ActionLog']['ip'].'</p>',
		$params,
		$a['ActionLog']['created']
	));
}
?>
</table></span>

	

<? 
echo "<div id=\"ActionsLink$lastActionId\">";
echo $ajax->link('load more actions', '/admins/js_miner_actions/'.$profileId.'/'.$lastActionId, array(
	'update' => 'ActionsDiv', 
	'position' => 'bottom', 
	'loaded' => "$('ActionsLink$lastActionId').hide();" )); 
?>
</div>
<? echo $ajax->divEnd('ActionsDiv'); ?>

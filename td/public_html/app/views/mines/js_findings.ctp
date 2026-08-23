<? echo $ajax->div('FindingsListDiv'); ?>

<? echo $this->element('findings'); ?>

<? 
echo "<div id=\"FindingsLink$lastFindingId\">";
if ($lastFindingId) 
	echo $ajax->link('load more findings', '/mines/js_findings/'.$lastFindingId, array(
		'update' => 'FindingsListDiv', 
		'position' => 'bottom', 
		'loaded' => "$('FindingsLink$lastFindingId').hide();" )); 
?>
</div>

<? echo $ajax->divEnd('FindingsListDiv'); ?>
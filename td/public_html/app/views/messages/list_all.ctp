<? echo $javascript->link('checkall.js');?>
<? //echo $javascript->link('formscripts.js');?>

<div id="fullcenter">
<BR>
<? foreach($filter as $name => $type)
{
	$alt = $name;
	if ($type == $messageTypeFilter)
		$name = "-$name-";
	echo '['.$ajax->link($name, 'js_filter/'.$type, array(
		'id' => 'filter'.$type, 
		'class' => 'filter', 
		'alt' => $alt,
		'onclick' => '$$("a.filter").each(function(i) { i.update(i.readAttribute("alt")); }); this.update("-"+this.readAttribute("alt")+"-");',
		'indicator' => 'LoadingDiv',
		'update' => 'messagelist')).'] ';
}
?>
<BR>
<BR>
<div id="messagelist">
<? include 'js_list_all.ctp'; ?>
</div>

</div>
<body>
<? 
echo $ajax->div('ProfileImageDiv');

if (isset($imageName))
{
	echo $html->image($imageName); 
}
if (isset($message))
	echo $message;

if (isset($close))
	echo '<SCRIPT type="text/javascript"> parent.location.reload(); </SCRIPT>';
echo $ajax->divEnd('ProfileImageDiv');

echo $ajax->div('SaveDiv');
if (isset($unownedItems) and count($unownedItems))
{
	echo "You need: ";
	list($key, $i) = each($unownedItems);
	echo $html->link($i['name'], '/items/view/'.$i['id'], array('onclick' => 'parent.location = this.href; parent.Lightview.hide(); return false;'));
	if (count($unownedItems) > 1)
		echo ' (more...)';
}
else
	echo '<a href="javascript:void(0);" class="accept" onclick="$(\'AvatarSave\').checked = true; $(\'ElementSubmitButton\').click(); return false; ">Save</a>';
echo $ajax->divEnd('SaveDiv');
?>
</body>
<div style="overflow:auto" >

<? 
if (isset($filename)) 
	echo $html->image($filename.'?time='.time());
	
if (isset($error)) echo $error;
?>

</div>
